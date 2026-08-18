import { onlineManager } from '@tanstack/react-query';
import * as Network from 'expo-network';

type ExpoNetworkState = Network.NetworkState | Network.NetworkStateEvent;

let reactQueryOnlineManagerRegistered = false;

export const isNetworkStateOnline = (state: ExpoNetworkState) => {
  if (state.isConnected === false) return false;
  if (state.isInternetReachable === false) return false;
  if (state.type === Network.NetworkStateType.NONE) return false;
  return true;
};

export const getCurrentNetworkOnline = async () => {
  try {
    return isNetworkStateOnline(await Network.getNetworkStateAsync());
  } catch {
    return true;
  }
};

export const registerReactQueryOnlineManager = () => {
  if (reactQueryOnlineManagerRegistered) return;
  reactQueryOnlineManagerRegistered = true;

  onlineManager.setEventListener((setOnline) => {
    getCurrentNetworkOnline().then(setOnline);
    const subscription = Network.addNetworkStateListener((state) => {
      setOnline(isNetworkStateOnline(state));
    });

    return () => subscription.remove();
  });
};
