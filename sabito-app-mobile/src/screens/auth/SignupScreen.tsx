import React, { useEffect } from 'react';
import { View, ActivityIndicator, StyleSheet } from 'react-native';
import COLORS from '../../constants/colors';
import type { AuthStackScreenProps } from '../../types/navigation';

/** Redirect stub — signup starts at SignupProfile. */
type SignupScreenProps = AuthStackScreenProps<'Signup'>;

const SignupScreen: React.FC<SignupScreenProps> = ({ navigation }) => {
  useEffect(() => {
    navigation.replace('SignupProfile' as any);
  }, [navigation]);

  return (
    <View style={styles.container}>
      <ActivityIndicator size="large" color={COLORS.APP_GREEN} />
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: COLORS.WHITE,
  },
});

export default SignupScreen;
