export const displayStatus = (status) => {
  if (status === "CLEARED") return "ACTIVE";
  return status;
};

export const isActive = (status) => {
  return status === "ACTIVE" || status === "CLEARED";
};
