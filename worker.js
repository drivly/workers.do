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

import { deployWorkerToPlatform, deployWorkerToCloudflare, setupCustomDomain } from './deploy'

export default {
  fetch: async (req, env) => {
    // const request = req.clone()
    const clonedReq = req.clone()
    let request = new Request(clonedReq)
    const ctx = await env.CTX.fetch(req).then(res => res.json())
    const { user, requestId, hostname, subdomain, body, rootPath, pathname, pathSegments } = ctx
    
//     console.log(body)
//     console.log(user)
    const { 
      name,
      context,
      worker,
      domain,
      config,
      cloudflareAccountId,
      cloudflareApiToken,
    } = body
    
    // console.log(context)

    const repoName = context?.payload?.repository?.name
    const ownerName = context?.payload?.repository?.owner?.name
    const committerName = context?.payload?.commits?.committer?.name.replaceAll(' ','-')
    const committerUsername = context?.payload?.commits?.committer?.username
    const ref = context?.payload?.ref.replace('ref/head/','').replace('ref/','').replaceAll('/','-')
    const email = context?.payload?.pusher?.email.replace('@','-at-').replaceAll('.','--')
    const commitSha = context?.sha
    
    console.log({name, repoName, ownerName, worker})
    
    
    if (req.method == 'GET' && req.url.startsWith('https://workers.do/api')) {
      if (!user.authenticated) return Response.redirect('https://workers.do/login')
      
      const [_,tags] = pathSegments
      const workers = await fetch(`https://api.cloudflare.com/client/v4/accounts/${env.CF_ACCOUNT_ID}/workers/dispatch/namespaces/${env.PLATFORM_NAMESPACE}/scripts${ tags ? '?tags=' + tags : '' }`, { headers: { 'authorization': 'Bearer ' + env.CF_API_TOKEN }}).then(res => res.json())
      
      return json({api,workers,user})
    }
    
    
    if (!subdomain) {

      const workerId = commitSha.slice(0,7) //+ '-' + ownerName //requestId
      const tags = [name, repoName, ownerName, domain, email, ref, workerId, committerUsername].filter(el => el)
      
      console.log({tags})

      const deployToUserAccount = (name.length > 1 && cloudflareAccountId.length > 10 && cloudflareApiToken.length > 10) ? true : false
      
      const namespace = env.PLATFORM_NAMESPACE // TODO: make this user/account specific
      
      const workersToDeploy = [
        name,
        `${commitSha.slice(0,7)}-${name}`,
        `${ref}-${name}`,
        domain && domain != '' ? domain : undefined,
//         domain && domain != '' ? `${ref}.${domain}` : undefined,
//         domain && domain != '' ? `${commitSha.slice(0,7)}.${domain}` : undefined,
      ].filter(el => el)
      
      const [platformResults, userAccountResults] = await Promise.all([
        Promise.all(workersToDeploy.map(workerId => deployWorkerToPlatform({ namespace, name: workerId, worker, config, tags, domain, cloudflareAccountId: env.CF_ACCOUNT_ID, cloudflareApiToken: env.CF_API_TOKEN }))),
        deployToUserAccount ? deployWorkerToCloudflare({ name, worker, config, tags, cloudflareAccountId, cloudflareApiToken }) : undefined,
      ])
        
      const results = [...platformResults, userAccountResults]

      console.log(JSON.stringify({results}))

      let codeLines = undefined
      let commentText = ''

      if (results[0].success) {
        
        const customDomain = (domain && domain != '') ? await setupCustomDomain(domain, context, env) : undefined

        
        commentText = 'Deployed successfully to: \n' + (domain && domain != '' ? (workersToDeploy.slice(3).map(id => `https://${id}`).join('\n') + '\n') : '') + workersToDeploy.slice(0,3).map(id => `https://${id}.workers.do`).join('\n')

        if (customDomain?.status == 'pending') {
          commentText = commentText + `\n\nFor the custom domain '${domain}' to work, you need to create the following DNS records:\n` 
          commentText = commentText + `CNAME '@' (${domain}) to 'workers.do'\n`
          commentText = commentText + `CNAME '*' (*.${domain}) to 'workers.do'\n`
          commentText = commentText + `${customDomain?.ownership_verification?.type?.toUppercase()} (${customDomain?.ownership_verification?.name}) value: '${customDomain?.ownership_verification?.value}'\n`
          commentText = commentText + customDomain?.ssl?.validation_records.map(record => `TXT (${record?.txt_name}) value: '${record?.txt_value}'\n`).join('')
        }
        
        const commentURL = `https://api.github.com/repos/${ownerName}/${repoName}/commits/${commitSha}/comments`
        console.log(commentURL)
        const comment = await fetch(commentURL, {
          body: JSON.stringify({ body: comment }),
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
        
        if (!hostname.includes('workers.do')) {
          res = await env.dispatcher.get(hostname).fetch(request)
        } else {
          res = await env.dispatcher.get(subdomain).fetch(request)
        }
        
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

