import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, Animated } from 'react-native';
import { checkConnection, subscribeToConnectionChanges } from './network';
import { initOfflineQueue, setSyncCallback, processQueue } from './offlineQueue';
import { checkPendingCount } from './offlineQueue';

const NetworkStatus = ({ pendingCount, syncing }) => {
  const [isConnected, setIsConnected] = useState(true);
  const [opacity] = useState(new Animated.Value(0));

  useEffect(() => {
    const init = async () => {
      await initOfflineQueue();
      const connected = await checkConnection();
      setIsConnected(connected);
      
      Animated.timing(opacity, {
        toValue: connected ? 0 : 1,
        duration: 300,
        useNativeDriver: true,
      }).start();
    };
    
    init();

    const unsubscribe = subscribeToConnectionChanges(async (connected) => {
      setIsConnected(connected);
      
      Animated.timing(opacity, {
        toValue: connected ? 0 : 1,
        duration: 300,
        useNativeDriver: true,
      }).start();

      if (connected) {
        processQueue();
      }
    });

    setSyncCallback(({ pending, synced }) => {
      if (synced > 0) {
        Animated.sequence([
          Animated.timing(opacity, {
            toValue: 1,
            duration: 200,
            useNativeDriver: true,
          }),
          Animated.delay(2000),
          Animated.timing(opacity, {
            toValue: isConnected ? 0 : 1,
            duration: 300,
            useNativeDriver: true,
          }),
        ]).start();
      }
    });

    return () => {
      if (unsubscribe) unsubscribe();
    };
  }, []);

  if (isConnected && !syncing && pendingCount === 0) {
    return null;
  }

  return (
    <Animated.View style={[styles.container, { opacity }]}>
      {!isConnected ? (
        <View style={styles.offline}>
          <Text style={styles.icon}>📴</Text>
          <Text style={styles.text}>No Internet - Transactions will sync when online</Text>
        </View>
      ) : syncing ? (
        <View style={styles.syncing}>
          <Text style={styles.icon}>🔄</Text>
          <Text style={styles.text}>Syncing {pendingCount} pending transaction(s)...</Text>
        </View>
      ) : pendingCount > 0 ? (
        <View style={styles.pending}>
          <Text style={styles.icon}>⏳</Text>
          <Text style={styles.text}>{pendingCount} pending transaction(s) waiting to sync</Text>
        </View>
      ) : null}
    </Animated.View>
  );
};

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    top: 50,
    left: 10,
    right: 10,
    borderRadius: 10,
    overflow: 'hidden',
  },
  offline: {
    backgroundColor: '#EF4444',
    padding: 12,
    flexDirection: 'row',
    alignItems: 'center',
  },
  syncing: {
    backgroundColor: '#3B82F6',
    padding: 12,
    flexDirection: 'row',
    alignItems: 'center',
  },
  pending: {
    backgroundColor: '#F59E0B',
    padding: 12,
    flexDirection: 'row',
    alignItems: 'center',
  },
  icon: {
    fontSize: 16,
    marginRight: 8,
  },
  text: {
    color: '#fff',
    fontSize: 13,
    fontWeight: '500',
    flex: 1,
  },
});

export { NetworkStatus, initOfflineQueue, processQueue, checkPendingCount };