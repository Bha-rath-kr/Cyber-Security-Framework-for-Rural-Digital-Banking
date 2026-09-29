const jwt = require("jsonwebtoken");
const User = require("../models/User");

module.exports = async function (req, res, next) {
  try {
    const authHeader = req.headers.authorization || "";
    if (!authHeader.startsWith("Bearer ")) return res.status(401).json({ error: "No token provided" });
    const token = authHeader.split(" ")[1];
    const payload = jwt.verify(token, process.env.JWT_SECRET);
    const user = await User.findById(payload.id);
    if (!user) return res.status(401).json({ error: "Invalid token user" });
    if (!user.isAdmin) return res.status(403).json({ error: "Unauthorized admin access" });
    req.user = user;
    next();
  } catch (err) {
    return res.status(401).json({ error: "Unauthorized" });
  }
};
