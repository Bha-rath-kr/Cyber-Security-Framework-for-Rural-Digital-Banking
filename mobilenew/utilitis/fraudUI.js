import { Alert } from "react-native";
import { formatINR } from "../utils/formatCurrency";

export function showFraudAlert(res, { onBlocked, onScheduled, onSuccess, onClose } = {}) {
  const {
    popupTitle,
    userMessage,
    allowProceed,
    actionRequired,
    decision,
    receiverStatus,
    fraudWarning,
    holdTime,
    txn_blocked,
    is_fraud,
    is_scheduled,
    fraud_reason,
    delay_reason,
    balance_after,
  } = res;

  const title = popupTitle || "Transaction";
  const message = userMessage || fraud_reason || delay_reason || "Processing complete.";

  if (txn_blocked || is_fraud || decision === "TEMP_FREEZE" || fraudWarning === true) {
    Alert.alert(
      title,
      `${message}\n\n${fraud_reason ? `Reason: ${fraud_reason}` : ""}`.trim(),
      [
        { text: "OK", onPress: () => { onBlocked?.(); onClose?.(); } }
      ]
    );
    return;
  }

  if (is_scheduled || actionRequired || holdTime > 0) {
    Alert.alert(
      title,
      `${message}\n\n${delay_reason ? `Reason: ${delay_reason}` : ""}\n${holdTime > 0 ? `Auto-processes in ${Math.round(holdTime / 60000)} minutes.` : ""}`.trim(),
      [
        { text: "Cancel", style: "cancel", onPress: () => onClose?.() },
        { text: "OK", onPress: () => { onScheduled?.(); onClose?.(); } }
      ]
    );
    return;
  }

  if (allowProceed && !fraudWarning) {
    Alert.alert(
      title,
      `${balance_after ? `New Balance: ${formatINR(balance_after)}\n\n` : ""}${message}`.trim(),
      [{ text: "OK", onPress: () => { onSuccess?.(); onClose?.(); } }]
    );
    return;
  }

  Alert.alert(title, message, [
    { text: "OK", onPress: () => { onSuccess?.(); onClose?.(); } },
  ]);
}

export function getReceiverBadge(receiverStatus) {
  switch (receiverStatus) {
    case "BLACKLISTED":
      return { label: "BLACKLISTED", color: "#DC2626", bg: "#FEE2E2", icon: "🚫" };
    case "TEMP_FROZEN":
      return { label: "TEMP. FROZEN", color: "#D97706", bg: "#FEF3C7", icon: "🧊" };
    case "UNDER_REVIEW":
      return { label: "UNDER REVIEW", color: "#9333EA", bg: "#F3E8FF", icon: "🔍" };
    case "HIGH_RISK":
      return { label: "HIGH RISK", color: "#EA580C", bg: "#FFF7ED", icon: "⚠️" };
    case "SAFE":
    default:
      return { label: "SAFE", color: "#16A34A", bg: "#DCFCE7", icon: "✅" };
  }
}
