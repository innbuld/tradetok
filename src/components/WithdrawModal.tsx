// Withdraw Modal Component
// Allows users to withdraw USDC from Hyperliquid to their wallet

import { useState } from "react";
import {
  X,
  Loader2,
  AlertCircle,
  ArrowDownToLine,
  CheckCircle2,
  Info,
} from "lucide-react";
import { useAccount, useSignTypedData } from "wagmi";
import {
  hyperliquidClient,
  WITHDRAW_DOMAIN,
  WITHDRAW_TYPES,
} from "@/lib/hyperliquidClient";
import { useToast } from "@/hooks/use-toast";

interface WithdrawModalProps {
  isOpen: boolean;
  onClose: () => void;
  availableBalance: number;
  onSuccess?: () => void;
}

export function WithdrawModal({
  isOpen,
  onClose,
  availableBalance,
  onSuccess,
}: WithdrawModalProps) {
  const { address } = useAccount();
  const { toast } = useToast();
  const { signTypedDataAsync } = useSignTypedData();

  const [amount, setAmount] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);

  const amountNum = parseFloat(amount) || 0;
  const withdrawalFee = 1; // $1 fee as per Hyperliquid docs (deducted from received amount)
  const minWithdraw = 1.01; // Need to withdraw more than the fee to receive something
  const maxWithdraw = availableBalance; // Can request up to full balance

  const isValidAmount = amountNum >= minWithdraw && amountNum <= maxWithdraw;

  const handleWithdraw = async () => {
    if (!address || !isValidAmount) return;

    setIsSubmitting(true);

    try {
      const timestamp = Date.now();

      // Build the message for EIP-712 signing
      const message = {
        hyperliquidChain: "Mainnet" as const,
        destination: address,
        amount: amount,
        time: BigInt(timestamp),
      };

      // Sign the typed data
      const signature = await signTypedDataAsync({
        account: address,
        domain: WITHDRAW_DOMAIN,
        types: WITHDRAW_TYPES,
        primaryType: "HyperliquidTransaction:Withdraw",
        message,
      });

      // Parse the signature into r, s, v components
      const r = signature.slice(0, 66);
      const s = "0x" + signature.slice(66, 130);
      const v = parseInt(signature.slice(130, 132), 16);

      // Submit to Hyperliquid
      const result = await hyperliquidClient.submitWithdraw(
        {
          type: "withdraw3",
          hyperliquidChain: "Mainnet",
          signatureChainId: "0xa4b1", // Arbitrum
          amount: amount,
          time: timestamp,
          destination: address,
        },
        timestamp,
        { r, s, v },
      );

      if (result.success) {
        setSuccess(true);
        toast({
          title: "Withdrawal Initiated",
          description: `$${amount} withdrawal is being processed. It should arrive in ~5 minutes.`,
        });
        onSuccess?.();
      } else {
        throw new Error(result.error || "Withdrawal failed");
      }
    } catch (err) {
      console.error("Withdrawal error:", err);
      toast({
        title: "Withdrawal Failed",
        description: err instanceof Error ? err.message : "Please try again",
        variant: "destructive",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleClose = () => {
    if (!isSubmitting) {
      setAmount("");
      setSuccess(false);
      onClose();
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm animate-fade-in"
        onClick={handleClose}
      />

      {/* Modal */}
      <div className="relative w-full max-w-md bg-card rounded-2xl shadow-2xl animate-slide-up overflow-hidden border border-border">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-border">
          <div className="flex items-center gap-2">
            <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
              <ArrowDownToLine className="w-5 h-5 text-primary" />
            </div>
            <div>
              <h2 className="text-lg font-bold">Withdraw</h2>
              <p className="text-xs text-muted-foreground">
                From Hyperliquid to Wallet
              </p>
            </div>
          </div>
          <button
            onClick={handleClose}
            disabled={isSubmitting}
            className="p-2 rounded-full hover:bg-secondary transition-colors disabled:opacity-50"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Success State */}
        {success ? (
          <div className="p-8 text-center">
            <div className="w-16 h-16 rounded-full bg-emerald-500/20 flex items-center justify-center mx-auto mb-4">
              <CheckCircle2 className="w-8 h-8 text-emerald-400" />
            </div>
            <h3 className="text-xl font-bold mb-2">Withdrawal Initiated!</h3>
            <p className="text-muted-foreground mb-6">
              ${amount} is being withdrawn to your wallet. This typically takes
              ~5 minutes.
            </p>
            <button
              onClick={handleClose}
              className="w-full py-3 rounded-xl bg-primary text-primary-foreground font-bold"
            >
              Done
            </button>
          </div>
        ) : (
          <>
            {/* Content */}
            <div className="p-4 space-y-4">
              {/* Available Balance */}
              <div className="bg-secondary/50 rounded-xl p-4">
                <div className="flex items-center justify-between">
                  <span className="text-sm text-muted-foreground">
                    Available
                  </span>
                  <span className="font-mono font-bold">
                    ${availableBalance.toFixed(2)}
                  </span>
                </div>
              </div>

              {/* Amount Input */}
              <div>
                <label className="text-sm font-medium text-muted-foreground mb-2 block">
                  Withdrawal Amount
                </label>
                <div className="relative">
                  <span className="absolute left-4 top-1/2 -translate-y-1/2 text-muted-foreground text-lg">
                    $
                  </span>
                  <input
                    type="number"
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                    placeholder="0.00"
                    min={minWithdraw}
                    max={maxWithdraw}
                    step="0.01"
                    className="w-full pl-8 pr-20 py-3 rounded-xl bg-secondary border border-border focus:border-primary focus:outline-none text-lg font-mono"
                    disabled={isSubmitting}
                  />
                  <button
                    onClick={() =>
                      setAmount(Math.max(0, maxWithdraw - 0.1).toFixed(2))
                    }
                    className="absolute right-2 top-1/2 -translate-y-1/2 px-3 py-1 rounded-lg bg-primary/10 text-primary text-sm font-medium hover:bg-primary/20 transition-colors"
                    disabled={isSubmitting}
                  >
                    MAX
                  </button>
                </div>
              </div>

              {/* Validation Messages */}
              {amountNum > 0 && amountNum <= withdrawalFee && (
                <div className="flex items-center gap-2 text-amber-500 text-sm">
                  <AlertCircle className="w-4 h-4" />
                  <span>
                    Withdraw more than ${withdrawalFee} to receive funds after
                    fee
                  </span>
                </div>
              )}

              {amountNum > maxWithdraw && (
                <div className="flex items-center gap-2 text-destructive text-sm">
                  <AlertCircle className="w-4 h-4" />
                  <span>Exceeds available balance</span>
                </div>
              )}

              {/* Fee Info */}
              <div className="bg-amber-500/10 border border-amber-500/20 rounded-xl p-3">
                <div className="flex items-start gap-2">
                  <Info className="w-4 h-4 text-amber-500 mt-0.5" />
                  <div className="text-sm">
                    <p className="text-amber-400 font-medium">
                      Withdrawal Fee: $1.00
                    </p>
                    <p className="text-muted-foreground text-xs mt-1">
                      Withdrawals typically take ~5 minutes to arrive on
                      Arbitrum
                    </p>
                  </div>
                </div>
              </div>

              {/* Summary */}
              {isValidAmount && (
                <div className="bg-secondary/30 rounded-xl p-4 space-y-2">
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">
                      Withdraw Amount
                    </span>
                    <span className="font-mono">${amountNum.toFixed(2)}</span>
                  </div>
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">Fee</span>
                    <span className="font-mono text-amber-400">
                      -${withdrawalFee.toFixed(2)}
                    </span>
                  </div>
                  <div className="border-t border-border pt-2 flex items-center justify-between">
                    <span className="font-medium">You'll Receive</span>
                    <span className="font-mono font-bold text-emerald-400">
                      ${(amountNum - withdrawalFee).toFixed(2)}
                    </span>
                  </div>
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="p-4 border-t border-border">
              <button
                onClick={handleWithdraw}
                disabled={!isValidAmount || isSubmitting}
                className="w-full py-4 rounded-xl bg-gradient-to-r from-primary to-purple-600 text-primary-foreground font-bold disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
              >
                {isSubmitting ? (
                  <>
                    <Loader2 className="w-5 h-5 animate-spin" />
                    Signing...
                  </>
                ) : (
                  <>
                    <ArrowDownToLine className="w-5 h-5" />
                    Withdraw ${amountNum > 0 ? amountNum.toFixed(2) : "0.00"}
                  </>
                )}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
