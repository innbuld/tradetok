// Wallet Connection Button with Web3Modal

import { useState, useEffect } from "react";
import {
  Wallet,
  LogOut,
  User,
  ChevronDown,
  Loader2,
  AlertCircle,
} from "lucide-react";
import {
  useAccount,
  useDisconnect,
  useSignTypedData,
  useSwitchChain,
  useChainId,
} from "wagmi";
import { useWeb3Modal } from "@web3modal/wagmi/react";
import { arbitrum } from "wagmi/chains";
import { usePearAuthContext } from "@/contexts/PearAuthContext";

interface WalletConnectButtonProps {
  className?: string;
  compact?: boolean;
}

export function WalletConnectButton({
  className = "",
  compact = false,
}: WalletConnectButtonProps) {
  const {
    isAuthenticated,
    isLoading: authLoading,
    address: pearAddress,
    account,
    login,
    logout,
    error: authError,
  } = usePearAuthContext();
  const { address, isConnected, isConnecting } = useAccount();
  const { open } = useWeb3Modal();
  const { disconnect } = useDisconnect();
  const { signTypedDataAsync } = useSignTypedData();
  const { switchChainAsync } = useSwitchChain();
  const chainId = useChainId();

  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [connectionError, setConnectionError] = useState<string | null>(null);
  const [isAuthenticating, setIsAuthenticating] = useState(false);

  // Auto-authenticate when wallet connects
  useEffect(() => {
    const authenticateWithPear = async () => {
      if (
        isConnected &&
        address &&
        !isAuthenticated &&
        !isAuthenticating &&
        !authLoading
      ) {
        setIsAuthenticating(true);
        setConnectionError(null);

        try {
          const signTypedData = async (params: unknown): Promise<string> => {
            const typedParams = params as {
              domain: Record<string, unknown>;
              types: Record<string, Array<{ name: string; type: string }>>;
              primaryType: string;
              message: Record<string, unknown>;
            };

            // Remove EIP712Domain from types if present
            const typesWithoutDomain = { ...typedParams.types };
            delete typesWithoutDomain.EIP712Domain;

            // Ensure we are on Arbitrum before signing
            if (chainId !== arbitrum.id) {
              try {
                await switchChainAsync({ chainId: arbitrum.id });
              } catch (switchError) {
                console.error("Failed to switch chain:", switchError);
                throw new Error("Please switch to Arbitrum network to sign in");
              }
            }

            // Use wagmi's signTypedDataAsync with account parameter
            const signature = await signTypedDataAsync({
              account: address,
              domain: typedParams.domain as any,
              types: typesWithoutDomain as any,
              primaryType: typedParams.primaryType as any,
              message: typedParams.message as any,
            });

            return signature;
          };

          await login(address, signTypedData);
        } catch (err) {
          console.error("Auth error:", err);
          const message =
            err instanceof Error ? err.message : "Authentication failed";
          setConnectionError(message);
        } finally {
          setIsAuthenticating(false);
        }
      }
    };

    authenticateWithPear();
  }, [
    isConnected,
    address,
    isAuthenticated,
    isAuthenticating,
    authLoading,
    chainId,
  ]);

  const handleConnect = async () => {
    setConnectionError(null);
    await open();
  };

  const handleDisconnect = async () => {
    setIsMenuOpen(false);
    await logout();
    disconnect();
  };

  const formatAddress = (addr: string): string => {
    return `${addr.slice(0, 6)}...${addr.slice(-4)}`;
  };

  const formatBalance = (value: number | undefined): string => {
    if (value === undefined) return "$0.00";
    return `$${value.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  };

  const isLoading = isConnecting || authLoading || isAuthenticating;

  // Connected and authenticated state
  if (isAuthenticated && pearAddress) {
    return (
      <div className={`relative ${className}`}>
        <button
          onClick={() => setIsMenuOpen(!isMenuOpen)}
          className={`flex items-center gap-2 rounded-xl bg-secondary hover:bg-secondary/80 transition-colors tap-scale ${
            compact ? "px-3 py-2" : "px-4 py-3"
          }`}
        >
          <div className="w-8 h-8 rounded-full bg-gradient-to-br from-primary to-purple-500 flex items-center justify-center">
            <User className="w-4 h-4 text-white" />
          </div>
          {!compact && (
            <>
              <div className="text-left">
                <p className="text-sm font-semibold">
                  {formatAddress(pearAddress)}
                </p>
                <p className="text-xs text-muted-foreground">
                  {formatBalance(account?.accountValue)}
                </p>
              </div>
              <ChevronDown
                className={`w-4 h-4 transition-transform ${isMenuOpen ? "rotate-180" : ""}`}
              />
            </>
          )}
        </button>

        {/* Dropdown Menu */}
        {isMenuOpen && (
          <>
            <div
              className="fixed inset-0 z-40"
              onClick={() => setIsMenuOpen(false)}
            />
            <div className="absolute right-0 top-full mt-2 w-56 rounded-xl bg-card border border-border shadow-lg z-50 py-2 animate-fade-in">
              <div className="px-4 py-3 border-b border-border">
                <p className="text-sm font-semibold">
                  {formatAddress(pearAddress)}
                </p>
                <p className="text-xs text-muted-foreground mt-1">
                  Balance: {formatBalance(account?.accountValue)}
                </p>
              </div>
              <button
                onClick={handleDisconnect}
                className="w-full flex items-center gap-3 px-4 py-3 hover:bg-secondary transition-colors text-left"
              >
                <LogOut className="w-4 h-4 text-destructive" />
                <span className="text-sm text-destructive">Disconnect</span>
              </button>
            </div>
          </>
        )}
      </div>
    );
  }

  // Connected but not authenticated yet
  if (isConnected && address && !isAuthenticated) {
    return (
      <div className={className}>
        <button
          disabled
          className={`flex items-center justify-center gap-2 rounded-xl bg-secondary text-foreground font-semibold transition-all tap-scale opacity-50 ${
            compact ? "px-3 py-2 text-sm" : "px-4 py-3"
          }`}
        >
          <Loader2 className="w-4 h-4 animate-spin" />
          <span>Signing...</span>
        </button>
      </div>
    );
  }

  // Not connected state
  return (
    <div className={className}>
      <button
        onClick={handleConnect}
        disabled={isLoading}
        className={`flex items-center justify-center gap-2 rounded-xl gradient-primary text-primary-foreground font-semibold transition-all tap-scale disabled:opacity-50 ${
          compact ? "px-3 py-2 text-sm" : "px-4 py-3"
        }`}
      >
        {isLoading ? (
          <>
            <Loader2 className="w-4 h-4 animate-spin" />
            <span>Connecting...</span>
          </>
        ) : (
          <>
            <Wallet className="w-4 h-4" />
            <span>{compact ? "Connect" : "Connect Wallet"}</span>
          </>
        )}
      </button>

      {/* Error display */}
      {(authError || connectionError) && (
        <div className="mt-2 p-2 rounded-lg bg-destructive/10 border border-destructive/20 flex items-start gap-2">
          <AlertCircle className="w-4 h-4 text-destructive flex-shrink-0 mt-0.5" />
          <p className="text-xs text-destructive">
            {authError || connectionError}
          </p>
        </div>
      )}
    </div>
  );
}
