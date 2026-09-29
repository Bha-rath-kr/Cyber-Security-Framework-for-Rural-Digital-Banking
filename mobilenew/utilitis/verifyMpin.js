import AsyncStorage from "@react-native-async-storage/async-storage";
import axios from "axios";
import { api_url } from "../config";

export async function verifyMpin(mpin) {
  const value = String(mpin || "").trim();
  if (!/^\d{4}$/.test(value)) {
    throw new Error("Enter your 4-digit GramBank MPIN.");
  }

  const token = await AsyncStorage.getItem("token");
  if (!token) {
    throw new Error("Your session has expired. Sign in again to continue.");
  }

  const response = await axios.post(
    `${api_url}/users/verify-mpin`,
    { mpin: value },
    {
      headers: { Authorization: `Bearer ${token}` },
      timeout: 15000,
    },
  );

  await AsyncStorage.removeItem("upiPin");
  return response.data;
}
