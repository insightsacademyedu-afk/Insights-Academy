import api from "./client";

export const attendanceApi = {
  list: params => api.get("/attendance", { params }).then(res => res.data),
  scan: token => api.post("/attendance/scan", { token }).then(res => res.data),
};
export const studentCardsApi = {
  get: id => api.get(`/student-cards/${id}`).then(res => res.data),
  action: (id, action) => api.post(`/student-cards/${id}/${action}`).then(res => res.data),
};
