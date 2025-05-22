import React, { FormEventHandler, useCallback, useEffect, useState } from 'react';
import { v4 as uuidv4 } from 'uuid';
import { getCountries, getCountryCallingCode, CountryCode } from 'libphonenumber-js';
import { Box, Button, Input, Spinner, Text, Overlay, OverlayBackdrop, OverlayCenter } from 'folds';
import { MatrixError } from 'matrix-js-sdk';
import { AsyncStatus, useAsyncCallback } from '../../../hooks/useAsyncCallback';
import { CustomLoginResponse, useLoginComplete } from './loginUtil';
import { FieldError } from '../FiledError';

const BASE_URL = 'http://localhost:8008';

type RequestTokenResponse = {
  sid: string;
};

type VerifyResponse = {
  access_token: string;
  device_id: string;
  user_id: string;
};

// Generate country list from libphonenumber-js
const COUNTRIES = getCountries()
  .map((countryCode) => {
    const callingCode = getCountryCallingCode(countryCode);
    let countryName = '';
    try {
      countryName =
        new Intl.DisplayNames(['en'], { type: 'region' }).of(countryCode) || countryCode;
    } catch (e) {
      countryName = countryCode;
    }
    return {
      value: countryCode,
      label: `${countryName} (+${callingCode})`,
      callingCode,
    };
  })
  .sort((a, b) => a.label.localeCompare(b.label));

// Custom styled select that works in both light and dark mode
function StyledSelect({
  value,
  onChange,
  children,
}: {
  value: string;
  onChange: (e: React.ChangeEvent<HTMLSelectElement>) => void;
  children: React.ReactNode;
}): JSX.Element {
  return (
    <div style={{ position: 'relative', width: '100%' }}>
      <Box
        as="select"
        value={value}
        onChange={onChange}
        style={{
          padding: '12px',
          borderRadius: '4px',
          width: '100%',
          appearance: 'none',
          backgroundColor: 'var(--bg-surface-low)',
          color: 'var(--tc-surface-high)',
          border: '1px solid var(--bg-surface-border)',
          fontSize: '14px',
          cursor: 'pointer',
          paddingRight: '32px',
        }}
      >
        {children}
      </Box>
      <div
        style={{
          position: 'absolute',
          top: '50%',
          right: '12px',
          transform: 'translateY(-50%)',
          pointerEvents: 'none',
        }}
      >
        <svg
          width="12"
          height="12"
          viewBox="0 0 12 12"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
        >
          <path d="M6 9L2 5H10L6 9Z" fill="currentColor" />
        </svg>
      </div>
    </div>
  );
}

export function PhoneLoginForm() {
  const [phoneNumber, setPhoneNumber] = useState('');
  const [country, setCountry] = useState<CountryCode>('US');
  const [placeholder, setPlaceholder] = useState('');
  const [otp, setOtp] = useState('');
  const [sid, setSid] = useState('');
  const [otpSent, setOtpSent] = useState(false);
  const [clientSecret] = useState(uuidv4());

  // Update placeholder when country changes
  useEffect(() => {
    try {
      setPlaceholder(`+${getCountryCallingCode(country)}`);
    } catch (e) {
      setPlaceholder(`+${getCountryCallingCode(country)}`);
    }
  }, [country]);

  // Request OTP
  const [requestTokenState, requestToken] = useAsyncCallback<
    RequestTokenResponse,
    MatrixError,
    [string, CountryCode, string, number]
  >(
    useCallback(async (phoneNum, countryCode, secret, attempt) => {
      const response = await fetch(`${BASE_URL}/_matrix/client/v3/register/phone/requestToken`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          phone_number: phoneNum,
          country: countryCode,
          client_secret: secret,
          send_attempt: attempt,
        }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new MatrixError(error);
      }

      return response.json();
    }, [])
  );

  // Verify OTP
  const [verifyState, verifyOtp] = useAsyncCallback<VerifyResponse, MatrixError, [string, string]>(
    useCallback(async (sessionId, otpCode) => {
      const response = await fetch(`${BASE_URL}/_matrix/client/v3/register/phone/verify`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          sid: sessionId,
          otp: otpCode,
        }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new MatrixError(error);
      }

      return response.json();
    }, [])
  );

  useLoginComplete(
    verifyState.status === AsyncStatus.Success
      ? ({
          baseUrl: BASE_URL,
          response: {
            access_token: verifyState.data?.access_token,
            device_id: verifyState.data?.device_id,
            user_id: verifyState.data?.user_id,
          },
        } as CustomLoginResponse)
      : undefined
  );

  const handleSendOtp: FormEventHandler<HTMLFormElement> = (evt) => {
    evt.preventDefault();
    if (!phoneNumber) return;

    requestToken(phoneNumber, country, clientSecret, 1).then((response) => {
      if (response) {
        setSid(response.sid);
        setOtpSent(true);
      }
    });
  };

  const handleVerifyOtp: FormEventHandler<HTMLFormElement> = (evt) => {
    evt.preventDefault();
    if (!otp || !sid) return;

    verifyOtp(sid, otp);
  };

  const handleCountryChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    setCountry(e.target.value as CountryCode);
  };

  if (!otpSent) {
    return (
      <Box as="form" onSubmit={handleSendOtp} direction="Inherit" gap="400">
        <Box direction="Column" gap="200">
          <Box direction="Column" gap="100">
            <Text as="label" size="L400" priority="300">
              Country
            </Text>
            <StyledSelect value={country} onChange={handleCountryChange}>
              {COUNTRIES.map((countryOption) => (
                <option key={countryOption.value} value={countryOption.value}>
                  {countryOption.label}
                </option>
              ))}
            </StyledSelect>
          </Box>

          <Box direction="Column" gap="100">
            <Text as="label" size="L400" priority="300">
              Phone Number
            </Text>
            <Input
              value={phoneNumber}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => setPhoneNumber(e.target.value)}
              placeholder={placeholder}
              variant="Background"
              size="500"
              required
              outlined
            />
            {requestTokenState.status === AsyncStatus.Error && (
              <FieldError message="Failed to send verification code. Please try again." />
            )}
          </Box>
        </Box>

        <Button
          type="submit"
          variant="Primary"
          size="500"
          disabled={requestTokenState.status === AsyncStatus.Loading}
        >
          <Text as="span" size="B500">
            Send Verification Code
          </Text>
        </Button>

        <Overlay
          open={requestTokenState.status === AsyncStatus.Loading}
          backdrop={<OverlayBackdrop />}
        >
          <OverlayCenter>
            <Spinner variant="Secondary" size="600" />
          </OverlayCenter>
        </Overlay>
      </Box>
    );
  }

  return (
    <Box as="form" onSubmit={handleVerifyOtp} direction="Inherit" gap="400">
      <Box direction="Column" gap="100">
        <Text as="label" size="L400" priority="300">
          Verification Code
        </Text>
        <Input
          value={otp}
          onChange={(e: React.ChangeEvent<HTMLInputElement>) => setOtp(e.target.value)}
          placeholder="Enter 6-digit code"
          variant="Background"
          size="500"
          required
          outlined
          maxLength={6}
        />
        {verifyState.status === AsyncStatus.Error && (
          <FieldError message="Invalid verification code. Please try again." />
        )}
      </Box>

      <Box direction="Row" gap="200">
        <Button
          type="button"
          variant="Secondary"
          size="500"
          onClick={() => setOtpSent(false)}
          disabled={verifyState.status === AsyncStatus.Loading}
        >
          <Text as="span" size="B500">
            Back
          </Text>
        </Button>
        <Button
          type="submit"
          variant="Primary"
          size="500"
          disabled={verifyState.status === AsyncStatus.Loading}
          style={{ flexGrow: 1 }}
        >
          <Text as="span" size="B500">
            Verify
          </Text>
        </Button>
      </Box>

      <Overlay
        open={
          verifyState.status === AsyncStatus.Loading || verifyState.status === AsyncStatus.Success
        }
        backdrop={<OverlayBackdrop />}
      >
        <OverlayCenter>
          <Spinner variant="Secondary" size="600" />
        </OverlayCenter>
      </Overlay>
    </Box>
  );
}
