import api from "./client";

export const notificationsApi = {
  recipients: params => api.get("/notifications/recipients", { params }).then(res => res.data),
  send: body => api.post("/notifications", body).then(res => res.data),
  list: (guardian, page) => api.get(guardian ? "/guardian-portal/notifications" : "/notifications", { params: { page, limit: 10 } }).then(res => res.data),
  markRead: id => api.patch(`/guardian-portal/notifications/${id}/read`).then(res => res.data),
};
