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
    const { user, origin, requestId, method, body, time, pathname, pathSegments, pathOptions, url, query } = await env.CTX.fetch(req).then(res => res.json())
    if (pathname == '/subscribe' && !user.profile) return Response.redirect(origin + '/login')

    return new Response(JSON.stringify({ api, user }, null, 2), { headers: { 'content-type': 'application/json; charset=utf-8' }})
  },
}
