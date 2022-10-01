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
    ...config,
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
