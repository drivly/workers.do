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
    const { user, subdomain, body, pathname } = await env.CTX.fetch(req).then(res => res.json())
    
    // "https://api.cloudflare.com/client/v4/accounts/<ACCOUNT_ID>/workers/dispatch/namespaces/<NAMESPACE_NAME>/scripts/<SCRIPT_NAME>"
    if (!subdomain) {
      const module = body ?? await fetch('https:/' + pathname).then(res => res.text())
//       const res => await fetch(
      return new Response(JSON.stringify({ api, status, headers, data, user }, null, 2), { headers: { 'content-type': 'application/json; charset=utf-8' }})
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
    let body = await res.text()
    let data = await JSON.parse(body).catch() ?? body
 
    return new Response(JSON.stringify({ api, status, headers, data, user }, null, 2), { headers: { 'content-type': 'application/json; charset=utf-8' }})
  },
}
