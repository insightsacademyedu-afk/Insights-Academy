import api from "./client";
import { createResourceApi } from "./resource";

export const guardiansApi = {
  ...createResourceApi("/guardians"),
  resetPassword: (id, password) => api.post(`/guardians/${id}/reset-password`, { password }).then(res => res.data),
  revokeLogin: id => api.post(`/guardians/${id}/revoke-login`).then(res => res.data),
};

export const guardianPortalApi = {
  children: () => api.get("/guardian-portal/children").then(res => res.data),
  overview: id => api.get(`/guardian-portal/children/${id}`).then(res => res.data),
  records: (id, kind, page) => api.get(`/guardian-portal/children/${id}/${kind}`, { params: { page, limit: 20 } }).then(res => res.data),
};
