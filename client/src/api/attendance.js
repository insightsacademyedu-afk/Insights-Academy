import api from "./client";

export const attendanceApi = {
  list: params => api.get("/attendance", { params }).then(res => res.data),
  scan: token => api.post("/attendance/scan", { token }).then(res => res.data),
  roster: params => api.get("/attendance/roster", { params }).then(res => res.data),
  mark: body => api.post("/attendance/manual", body).then(res => res.data),
};
export const teacherAttendanceApi = {
  scan: token => api.post("/teacher-attendance/scan", { token }).then(res => res.data),
  list: params => api.get("/teacher-attendance", { params }).then(res => res.data),
  teachers: params => api.get("/teacher-attendance/teachers", { params }).then(res => res.data),
  mark: teacher => api.post("/teacher-attendance", { teacher }).then(res => res.data),
};
export const teacherCardsApi = {
  get: id => api.get(`/teacher-cards/${id}`).then(res => res.data),
  update: (id, body) => api.put(`/teacher-cards/${id}`, body).then(res => res.data),
  action: (id, action) => api.post(`/teacher-cards/${id}/${action}`).then(res => res.data),
};
export const studentCardsApi = {
  get: id => api.get(`/student-cards/${id}`).then(res => res.data),
  action: (id, action) => api.post(`/student-cards/${id}/${action}`).then(res => res.data),
};
