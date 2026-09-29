import React, { useEffect } from "react";
import { View, Text, Image, StyleSheet, StatusBar } from "react-native";

const SplashScreen = ({ navigation }) => {
  useEffect(() => {
    const timer = setTimeout(() => {
      navigation.replace("Login"); // Navigate to Login after 3 seconds
    }, 3000);
    return () => clearTimeout(timer);
  }, [navigation]);

  return (
    <View style={styles.container}>
      <StatusBar backgroundColor="#7C4DFF" barStyle="light-content" />
      <Image
        source={require("../assets/logo.png")} 
        style={styles.logo}
      />
      <Text style={styles.title}>GramBank</Text>
      <Text style={styles.subtitle}>Secure Banking for Every Village</Text>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#7C4DFF",
    alignItems: "center",
    justifyContent: "center",
  },
  logo: {
    width: 120,
    height: 120,
    marginBottom: 20,
    borderRadius: 20,
  },
  title: {
    fontSize: 32,
    fontWeight: "bold",
    color: "#fff",
  },
  subtitle: {
    fontSize: 16,
    color: "#E0E0E0",
    marginTop: 8,
  },
});

export default SplashScreen;
