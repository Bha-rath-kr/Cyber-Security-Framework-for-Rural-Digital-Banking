import React from "react";
import { NavigationContainer } from "@react-navigation/native";
import { createStackNavigator } from "@react-navigation/stack";
import { StatusBar } from "react-native";
import { useFonts } from "expo-font";
import { iconFont } from "./components/Icon";
import SplashScreen from "./screens/SplashScreen";
import SignupStep1 from "./screens/SignupStep1";
import SignupStep2 from "./screens/SignupStep2";
import LoginScreen from "./screens/LoginScreen";
import Dashboard from "./screens/Dashboard";
import Transaction from "./screens/Transaction";
import History from "./screens/History";
import FraudReport from "./screens/FraudReport";
import Settings from "./screens/Settings";
import UPIQRPay from "./screens/UPIQRPay";
import UpiPayment from "./screens/UpiPayment";
import ReceiveMoney from "./screens/ReceiveMoney";
import CheckBalance from "./screens/CheckBalance";
import AlertsScreen from "./screens/AlertsScreen";
import PaytoMobile from "./screens/PayMobile";
import SupportScreen from "./screens/supportScreen";
import EmailSupportScreen from "./screens/EmailSupportScreen";
import UPIRequestsScreen from "./screens/UPIRequests";
import CreateUPIRequestScreen from "./screens/CreateUPIRequest";
import ReportTransactionScreen from "./screens/ReportTransaction";
import MyReportsScreen from "./screens/MyReports";
import ChatBotScreen from "./screens/ChatBot";
import LiveChatScreen from "./screens/LiveChat";
import ForgotPinScreen from "./screens/ForgotPin";
import PayToUPI from "./screens/PayToUPI";
import PaymentResult from "./screens/PaymentResult";
import { initOfflineQueue } from "./utilitis/offlineQueue";

const Stack = createStackNavigator();

export default function App() {
  const [fontsLoaded, fontError] = useFonts(iconFont);

  React.useEffect(() => {
    initOfflineQueue();
  }, []);

  if (fontError) throw fontError;
  if (!fontsLoaded) return null;

  return (
    <NavigationContainer>
      <StatusBar backgroundColor="#7C4DFF" barStyle="light-content" />
      <Stack.Navigator
        initialRouteName="Login"
        screenOptions={{
          headerShown: false,
          animationEnabled: true,
        }}
      >
        {/* Onboarding */}
        <Stack.Screen name="Splash" component={SplashScreen} />
        <Stack.Screen name="Login" component={LoginScreen} />
        <Stack.Screen name="Dashboard" component={Dashboard} />
        <Stack.Screen name="PaytoMobile" component={PaytoMobile} />
        <Stack.Screen name="Transaction" component={Transaction} />
        <Stack.Screen name="History" component={History} />
        <Stack.Screen name="FraudReport" component={FraudReport} />
        <Stack.Screen name="Settings" component={Settings} />
        <Stack.Screen name="SignupStep1" component={SignupStep1} />
        <Stack.Screen name="SignupStep2" component={SignupStep2} />
        <Stack.Screen name="UPIQRPay" component={UPIQRPay} />
        <Stack.Screen name="ReceiveMoney" component={ReceiveMoney} />
        <Stack.Screen name="CheckBalance" component={CheckBalance} />
        <Stack.Screen name="Alerts" component={AlertsScreen} />

        <Stack.Screen name="UPIPaymentScreen" component={UpiPayment} />
        <Stack.Screen name="PaymentResult" component={PaymentResult} />
        <Stack.Screen name="SupportScreen" component={SupportScreen} />
        <Stack.Screen name="EmailSupportScreen" component={EmailSupportScreen} />
        <Stack.Screen name="UPIRequests" component={UPIRequestsScreen} />
        <Stack.Screen name="CreateUPIRequest" component={CreateUPIRequestScreen} />
        <Stack.Screen name="ReportTransaction" component={ReportTransactionScreen} />
        <Stack.Screen name="MyReports" component={MyReportsScreen} />
        <Stack.Screen name="ChatBot" component={ChatBotScreen} />
        <Stack.Screen name="LiveChat" component={LiveChatScreen} />
        <Stack.Screen name="ForgotPin" component={ForgotPinScreen} />
        <Stack.Screen name="PayToUPI" component={PayToUPI} />
      </Stack.Navigator>
    </NavigationContainer>
  );
}
