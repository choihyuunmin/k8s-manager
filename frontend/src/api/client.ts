import axios from 'axios'

const client = axios.create({
  baseURL: '',
  headers: { 'Content-Type': 'application/json' },
})

client.interceptors.request.use((config) => {
  const token = localStorage.getItem('token')
  if (token) {
    config.headers.Authorization = `Bearer ${token}`
  }
  return config
})

client.interceptors.response.use(
  (res) => res,
  (err) => {
    if (err.response?.status === 401) {
      localStorage.removeItem('token')
      localStorage.removeItem('user')
      window.location.href = '/login'
    }
    return Promise.reject(err)
  },
)

export const authApi = {
  login: (username: string, password: string) =>
    client.post<{ token: string; user: { username: string; role: string } }>('/api/auth/login', { username, password }),
  me: () => client.get<{ username: string; role: string }>('/api/auth/me'),
}

export const clusterApi = {
  getNodes: () => client.get('/api/cluster/nodes'),
  getPods: (namespace?: string) => client.get('/api/cluster/pods', { params: { namespace } }),
  getDeployments: (namespace?: string) => client.get('/api/cluster/deployments', { params: { namespace } }),
  getServices: (namespace?: string) => client.get('/api/cluster/services', { params: { namespace } }),
  getEvents: (namespace?: string) => client.get('/api/cluster/events', { params: { namespace } }),
  getNamespaces: () => client.get<{ name: string; status: string }[]>('/api/cluster/namespaces'),
  getSummary: (namespace?: string) => client.get('/api/cluster/summary', { params: { namespace } }),
  getResourceYaml: (kind: string, name: string, namespace: string) =>
    client.get<{ yaml: string; kind: string; name: string; namespace: string }>('/api/cluster/resource/yaml', { params: { kind, name, namespace } }),
}

export const imageApi = {
  upload: (file: File, onProgress?: (pct: number) => void, application?: string) => {
    const form = new FormData()
    form.append('file', file)
    if (application) form.append('application', application)
    return client.post('/api/images/upload', form, {
      headers: { 'Content-Type': 'multipart/form-data' },
      onUploadProgress: (e) => {
        if (e.total && onProgress) onProgress(Math.round((e.loaded * 100) / e.total))
      },
    })
  },
  list: () => client.get('/api/images'),
  load: (imageId: number, nodeIds: number[]) =>
    client.post(`/api/images/${imageId}/load`, { node_ids: nodeIds }),
  getNodeImages: (nodeId: number) => client.get('/api/images/node/' + nodeId + '/list'),
  replace: (data: { image_id: number; node_ids: number[]; target_image: string; restart_deployments: boolean }) =>
    client.post('/api/images/replace', data),
  getApplications: () => client.get<string[]>('/api/images/applications'),
  delete: (imageId: number) => client.delete(`/api/images/${imageId}`),
}

export const manifestApi = {
  list: () => client.get('/api/manifests'),
  get: (id: string) => client.get(`/api/manifests/${id}`),
  create: (data: { name: string; content_yaml: string; kind: string; namespace: string }) =>
    client.post('/api/manifests', data),
  update: (id: string, data: { name: string; content_yaml: string; kind: string; namespace: string }) =>
    client.put(`/api/manifests/${id}`, data),
  delete: (id: string) => client.delete(`/api/manifests/${id}`),
  apply: (id: string) => client.post(`/api/manifests/${id}/apply`),
  validate: (content_yaml: string) => client.post('/api/manifests/validate', { content_yaml }),
  versions: (id: string) => client.get(`/api/manifests/${id}/versions`),
}

export const logsApi = {
  getPods: (namespace: string) => client.get(`/api/logs/pods/${namespace}`),
  getContainers: (namespace: string, pod: string) =>
    client.get(`/api/logs/containers/${namespace}/${pod}`),
}

export const issueApi = {
  list: (params?: { status?: string; severity?: string }) =>
    client.get('/api/issues', { params }),
  get: (id: string) => client.get(`/api/issues/${id}`),
  create: (data: { title: string; description: string; resource: string; severity: string }) =>
    client.post('/api/issues', data),
  update: (id: string, data: Partial<{ title: string; description: string; status: string; severity: string }>) =>
    client.put(`/api/issues/${id}`, data),
  delete: (id: string) => client.delete(`/api/issues/${id}`),
}

export const historyApi = {
  list: (params?: { action_type?: string; resource_kind?: string; date_from?: string; date_to?: string }) =>
    client.get('/api/history', { params }),
}

export const nodeApi = {
  list: () => client.get('/api/nodes'),
  create: (data: { name: string; host: string; port: number; username: string; password?: string }) =>
    client.post('/api/nodes', data),
  update: (id: string, data: Partial<{ name: string; host: string; port: number; username: string; password?: string }>) =>
    client.put(`/api/nodes/${id}`, data),
  delete: (id: string) => client.delete(`/api/nodes/${id}`),
  testConnection: (id: string) => client.post(`/api/nodes/${id}/test`),
}

export default client
