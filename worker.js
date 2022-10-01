export const api = {
  icon: '💸',
  name: 'workers.do',
  description: 'Workers for Platforms with Dynamic Service Bindings',
  url: 'https://workers.do/api',
  type: 'https://apis.do/workers',
  endpoints: {
    listWorkers: 'https://workers.do/api',
  },
  site: 'https://workers.do',
  login: 'https://workers.do/login',
  signup: 'https://workers.do/signup',
  subscribe: 'https://workers.do/subscribe',
  repo: 'https://github.com/drivly/workers.do',
}

export default {
  fetch: async (req, env) => {
    // const request = req.clone()
    const clonedReq = req.clone()
    let request = new Request(clonedReq)
    const ctx = await env.CTX.fetch(req).then(res => res.json())
    const { user, requestId, subdomain, body, rootPath, pathname, pathSegments } = ctx
    
//     console.log(body)
//     console.log(user)
    const { 
      name,
      context,
      worker,
      domain,
      cloudflareAccountId,
      cloudflareApiToken,
    } = body
    
    // console.log(context)

    const repoName = context?.payload?.repository?.name
    const ownerName = context?.payload?.repository?.owner?.name
    const committerName = context?.payload?.commits?.committer?.name.replaceAll(' ','-')
    const committerUsername = context?.payload?.commits?.committer?.username
    const ref = context?.payload?.ref.replace('ref/heads/','').replace('ref/','').replaceAll('/','-')
    const email = context?.payload?.pusher?.email.replace('@','-at-').replaceAll('.','--')
    const commitSha = context?.sha
    
    console.log({name, repoName, ownerName, worker})
    
    
    if (req.method == 'GET' && req.url.startsWith('https://workers.do/api')) {
      if (!user.authenticated) return Response.redirect('https://workers.do/login')
      
      const [_,tags] = pathSegments
      const workers = await fetch(`https://api.cloudflare.com/client/v4/accounts/${env.CF_ACCOUNT_ID}/workers/dispatch/namespaces/${env.PLATFORM_NAMESPACE}/scripts${ tags ? '?tags=' + tags : '' }`, { headers: { 'authorization': 'Bearer ' + env.CF_API_TOKEN }}).then(res => res.json())
      
      return json({api,workers,user})
    }
    
    
    // "https://api.cloudflare.com/client/v4/accounts/${CF_ACCOUNT_ID}/workers/dispatch/namespaces/${namespace}/scripts/{requestId}"
    if (!subdomain) {

      const workerId = commitSha.slice(0,7) //+ '-' + ownerName //requestId
      const tags = [name, repoName, ownerName, domain, email, ref, workerId, committerUsername].filter(el => el)
      
      console.log({tags})
      
      const scriptContent = worker //?? rootPath ? "export default {\n  fetch: () => new Response('Hello World')\n}" : await fetch('https:/' + pathname).then(res => res.text()).catch() 
      // const scriptFileName = 'worker.js';
      const metadata = {
        'main_module': 'worker.mjs', // 'index.mjs', // Figure out why the index module can't import the worker
        'tags': tags,
        // services: [  // Might not work yet...
        //   {
        //     binding: "",
        //     service: "",
        //     environment: ""
        //   }
        // ],
        // bindings: [
        //   {
        //     "type": "",
        //     "param": "",
        //     "name": ""
        //   }
        // ],
      }

      const deployToUserAccount = (name.length > 1 && cloudflareAccountId.length > 10 && cloudflareApiToken.length > 10) ? true : false

      const cloudflareDeployURL = deployToUserAccount ? 
        `https://api.cloudflare.com/client/v4/accounts/${cloudflareAccountId}/workers/scripts/${name}` : 
        `https://api.cloudflare.com/client/v4/accounts/${env.CF_ACCOUNT_ID}/workers/dispatch/namespaces/${env.PLATFORM_NAMESPACE}/scripts/${workerId}`
        
      console.log({deployToUserAccount, cloudflareDeployURL})

      // Create a wrapper for the worker module to inject the ctx object
      const workerWrapper = `
import worker from 'worker'

export default {
  fetch: (req, env, ctx) => {
    const headers = Object.fromEntries(req.headers)
    const request = new Request(req)
    request.ctx = JSON.parse(headers['ctx-do'])
    request.headers.delete('cookie')
    request.headers.delete('ctx-do')
    return worker.fetch(request, env, ctx)
  }
}
`


      const formData = new FormData()
      formData.append('worker', new File([scriptContent], 'worker.mjs', { type: 'application/javascript+module'}))
      formData.append('index', new File([workerWrapper], 'index.mjs', { type: 'application/javascript+module'}));
      formData.append('metadata', new File([JSON.stringify(metadata)], 'metadata.json', { type: 'application/json'}))
      const results = await fetch(cloudflareDeployURL, {
        method: 'PUT',
        body: formData,
        headers: {
          'authorization': 'Bearer ' + (deployToUserAccount ? cloudflareApiToken : env.CF_API_TOKEN),
        },
      }).then(res => res.json()).catch(({name, message, stack }) => ({ error: {name, message, stack}}))

      console.log(Object.entries(formData))

      console.log(JSON.stringify({results}))

      let url, codeLines = undefined

      if (results.success) {

        url = `https://${workerId}.workers.do`

        const commentURL = `https://api.github.com/repos/${ownerName}/${repoName}/commits/${commitSha}/comments`
        console.log(commentURL)
        const comment = await fetch(commentURL, {
          body: JSON.stringify({ body: 'Deployed successfully to ' + url }),
          headers: {
            Accept: 'application/vnd.github+json',
            Authorization: 'Bearer ' + env.GITHUB_TOKEN,
            "Content-Type": "application/x-www-form-urlencoded",
            "User-Agent": "https://workers.do"
          },
          method: 'POST'
        }).then(res => res.text()).catch(({name, message, stack }) => ({ error: {name, message, stack}}))
        console.log(comment)
      } else {
        codeLines = scriptContent.split('\n')
      }
    
      return new Response(JSON.stringify({ api, url, results, codeLines, user }, null, 2), { headers: { 'content-type': 'application/json; charset=utf-8' }})
    }
    
    let res = undefined
    try {
      try {
        request.cf.user = user
        request.cf.ctx = ctx
        request.headers.append('ctx-do', JSON.stringify(ctx))
        res = await env.dispatcher.get(subdomain).fetch(request)
        return res
      } catch ({name, message, stack }) {
        return new Response(JSON.stringify({ status: 500, error: { name, message, stack }}))
      }
    } catch (e) {
      if (e.message == 'Error: Worker not found.') {
          return new Response(JSON.stringify({ message: 'Error: Worker not found. If you just deployed, try again in a few seconds', url: req.url }, null, 2), {status: 404})
      }
      return new Response(e.message, {status: 500})
    }
    
    const { status } = req
    const headers = Object.fromEntries(res.headers)
    let text = await res.text()
    // let data = text.startsWith('{') || text.startsWith('[') ? await JSON.parse(body).catch() : text
 
    return new Response(JSON.stringify({ api, status, text, headers, data, user }, null, 2), { headers: { 'content-type': 'application/json; charset=utf-8' }})
  },
}

export const json = data  => new Response(JSON.stringify(data, null, 2), { headers: { 'content-type': 'application/json; charset=utf-8' }})

