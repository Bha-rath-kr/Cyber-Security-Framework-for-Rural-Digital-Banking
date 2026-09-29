import api from "./axios";

export const loginAdmin = (aadhaarNumber, mpin) =>
  api.post("/admin/login", { aadhaarNumber, mpin });
