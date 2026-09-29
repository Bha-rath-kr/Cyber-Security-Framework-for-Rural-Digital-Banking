import axios from "axios";

const sendSms = async (phone, otp) => {
  try {
    const res = await axios.post("https://textbelt.com/text", {
      phone: phone,
      message: `Your GramBank verification code is ${otp}`,
      key: "textbelt", // ⚠️ public test key
    });

    if (res.data.success) {
      alert("OTP sent successfully!");
    } else {
      alert("SMS failed: " + JSON.stringify(res.data));
    }
  } catch (err) {
    console.error(err);
    alert("Error sending SMS");
  }
};
