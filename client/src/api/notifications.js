import api from "./client";

export const notificationsApi = {
  send: body => api.post("/notifications", body).then(res => res.data),
  list: page => api.get("/notifications", { params: { page, limit: 10 } }).then(res => res.data),
  markRead: id => api.patch(`/notifications/${id}/read`).then(res => res.data),
};
