import React from 'react';
import { Box, Text } from 'folds';
import { PhoneLoginForm } from './PhoneLoginForm';

export function Login() {
  return (
    <Box direction="Column" gap="500">
      <Text size="H2" priority="400">
        Login
      </Text>
      <PhoneLoginForm />
    </Box>
  );
}
