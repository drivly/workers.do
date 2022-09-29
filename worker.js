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
    const { user, requestId, subdomain, body, pathname } = await env.CTX.fetch(req).then(res => res.json())
    
//     console.log(body)
//     console.log(user)
    const { 
      name,
      context,
      worker,
      cloudflareAccountId,
      cloudflareApiToken,
    } = body
    
    const repoName = context?.repository?.name
    const ownerName = context?.owner?.name
    
    console.log({name, repoName, ownerName, worker})
    
    // "https://api.cloudflare.com/client/v4/accounts/${CF_ACCOUNT_ID}/workers/dispatch/namespaces/${namespace}/scripts/{requestId}"
    if (!subdomain) {
      const module = worker ?? await fetch('https:/' + pathname).then(res => res.text()).catch() 
      
      const results = await fetch(`https://api.cloudflare.com/client/v4/accounts/${env.CF_ACCOUNT_ID}/workers/dispatch/namespaces/example-namespace/scripts/${requestId}`, {
          headers: {
            'authorization': 'Bearer ' + env.CF_API_TOKEN,
            'content-type': 'multipart/form-data; boundary=----WebKitFormBoundaryuAT7UVLyzllBl3ey',
          },
          body: `------WebKitFormBoundaryuAT7UVLyzllBl3ey\r\nContent-Disposition: form-data; name=\"metadata\"; filename=\"blob\"\r\nContent-Type: application/octet-stream\r\n\r\n{\"main_module\":\"worker.js\"}\r\n------WebKitFormBoundaryuAT7UVLyzllBl3ey\r\nContent-Disposition: form-data; name=\"worker.js\"; filename=\"worker.js\"\r\nContent-Type: application/javascript+module\r\n\r\n${"export default {\n  fetch: () => new Response('Hello World')\n}"}\r\n------WebKitFormBoundaryuAT7UVLyzllBl3ey--\r\n`,
          method: "POST",
       }).then(res => json()).catch(({name, message, stack}) => ({ error: {name, message, stack}}))

      console.log({results})
      
      return new Response(JSON.stringify({ api, results, user }, null, 2), { headers: { 'content-type': 'application/json; charset=utf-8' }})
    }
    
    let res = undefined
    try {
      res = await env.dispatcher.get(subdomain).fetch(request)
    } catch (e) {
      if (e.message == 'Error: Worker not found.') {
          return new Response('', {status: 404})
      }
      return new Response(e.message, {status: 500})
    }
    
    const { status } = req
    const headers = Object.fromEntries(res.headers)
    let text = await res.text()
    let data = await JSON.parse(body).catch() ?? text
 
    return new Response(JSON.stringify({ api, status, headers, data, user }, null, 2), { headers: { 'content-type': 'application/json; charset=utf-8' }})
  },
}
