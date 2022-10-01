export const deployWorkerToPlatform = async ({ namespace, name, worker, config, tags, cloudflareAccountId, cloudflareApiToken}) => {
  const cloudflareDeployURL = `https://api.cloudflare.com/client/v4/accounts/${cloudflareAccountId}/workers/dispatch/namespaces/${namespace}/scripts/${name}`
  return deployWorker(cloudflareDeployURL, worker, tags, config, cloudflareApiToken)
}

export const deployWorkerToCloudflare = async ({ name, worker, config, tags, cloudflareAccountId, cloudflareApiToken }) => {
  const cloudflareDeployURL = `https://api.cloudflare.com/client/v4/accounts/${cloudflareAccountId}/workers/scripts/${name}`
  return deployWorker(cloudflareDeployURL, worker, config, cloudflareApiToken)
}


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

const deployWorker = async (cloudflareDeployURL, module, config, tags, authToken) => {
  
  const metadata = {
//    ...config,
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

  const formData = new FormData()
  formData.append('worker', new File([module], 'worker.mjs', { type: 'application/javascript+module'}))
  formData.append('index', new File([workerWrapper], 'index.mjs', { type: 'application/javascript+module'}));
  formData.append('metadata', new File([JSON.stringify(metadata)], 'metadata.json', { type: 'application/json'}))

  const results = await fetch(cloudflareDeployURL, {
    method: 'PUT',
    body: formData,
    headers: {
      'authorization': 'Bearer ' + authToken,
    },
  }).then(res => res.json()).catch(({name, message, stack }) => ({ error: {name, message, stack}}))

  return results
}

export const setupCustomDomain = async (domain, context, env) => {
  
  let domainDetails = await env.PLATFORM_DOMAINS.getWithMetadata(domain, { type: "json" })
  
  if (!domainDetails?.value?.id) {
    const domainConfig = {
      hostname: domain,
      "ssl": {
        "method": "http",
        "type": "dv",
        "wildcard": false,
        "certificate_authority": "digicert",
        "settings": {
          "min_tls_version": "1.0"
        }
      }
    }
    console.log(domainConfig)
    const customHostname = await fetch( `https://api.cloudflare.com/client/v4/zones/${env.SAAS_ZONE_ID}/custom_hostnames`, {
      method: 'POST',
      body: JSON.parse(domainConfig),
      headers: {
        'authorization': 'Bearer ' +  env.WORKERS_DO_TOKEN,
        'content-type': 'application/json'
      },
    }).then(res => res.json()).catch(({name, message, stack }) => ({ error: {name, message, stack}}))
    
    console.log({customHostname})
    
    domainDetails = {  ...customHostname.result, context } 
    
    
    const owner = context?.payload?.repository?.owner?.name
    const name = context?.payload?.commits?.committer?.name.replaceAll(' ','-')
    const username = context?.payload?.commits?.committer?.username
    const email = context?.payload?.pusher?.email.replace('@','-at-').replaceAll('.','--')
    
    await env.PLATFORM_DOMAINS.put(domain, JSON.stringify({domainDetails}), { metadata: { id: domainDetails.id, owner, name, username, email  }})
    
    return domainDetails
    
  } else {
    const customHostname = await fetch( `https://api.cloudflare.com/client/v4/zones/${env.SAAS_ZONE_ID}/custom_hostnames/${domainDetails?.value?.id}`, {
      headers: { 'authorization': 'Bearer ' +  env.WORKERS_DO_TOKEN },
    }).then(res => res.json()).catch(({name, message, stack }) => ({ error: {name, message, stack}}))
    
    console.log({customHostname, domainDetails})
    
    return customHostname.result
    
  }
  
}
