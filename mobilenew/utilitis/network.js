import NetInfo from '@react-native-community/netinfo';

let isConnected = true;

let unsubscribe = null;

export const checkConnection = async () => {
  const state = await NetInfo.fetch();

  // For GramBank, local LAN access is enough.
  // Do not require general Internet access.
  isConnected = Boolean(state.isConnected);

  console.log('[Network] isConnected:', state.isConnected);
  console.log('[Network] isInternetReachable:', state.isInternetReachable);

  return isConnected;
};

export const getConnectionStatus = () => isConnected;

export const subscribeToConnectionChanges = (callback) => {
  unsubscribe = NetInfo.addEventListener(state => {
    const wasConnected = isConnected;

    // Only check whether the device is connected
    // to a network. The backend is on the local LAN.
    isConnected = Boolean(state.isConnected);

    console.log('[Network] isConnected:', state.isConnected);
    console.log('[Network] isInternetReachable:', state.isInternetReachable);

    if (!wasConnected && isConnected && callback) {
      callback(true);
    } else if (wasConnected && !isConnected && callback) {
      callback(false);
    }
  });

  checkConnection();

  return () => {
    if (unsubscribe) {
      unsubscribe();
      unsubscribe = null;
    }
  };
};
