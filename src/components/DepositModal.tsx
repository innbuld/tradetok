import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Loader2, ArrowRight, Wallet } from "lucide-react";
import { useAccount, useWriteContract, useBalance } from "wagmi";
import { parseUnits, formatUnits } from "viem";
import { erc20Abi } from "viem";

// Constants for Arbitrum One
const USDC_ADDRESS = "0xaf88d065e77c8cC2239327C5EDb3A432268e5831";
const BRIDGE_ADDRESS = "0x2df1c51e09aecf9cacb7bc98cb1742757f163df7";

interface DepositModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: () => void;
}

export function DepositModal({
  isOpen,
  onClose,
  onSuccess,
}: DepositModalProps) {
  const { address } = useAccount();
  const { writeContractAsync } = useWriteContract();

  // Fetch USDC Balance
  const { data: balanceData, isLoading: isBalanceLoading } = useBalance({
    address,
    token: USDC_ADDRESS,
  });

  const [amount, setAmount] = useState("5"); // Default to min required
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [txHash, setTxHash] = useState<string | null>(null);

  const handleDeposit = async () => {
    if (!address) return;
    setIsLoading(true);
    setError(null);

    try {
      const parsedAmount = parseUnits(amount, 6); // USDC has 6 decimals

      if (parsedAmount < parseUnits("5", 6)) {
        throw new Error("Minimum deposit is 5 USDC");
      }

      // Execute Transfer to Bridge
      const hash = await writeContractAsync({
        address: USDC_ADDRESS,
        abi: erc20Abi,
        functionName: "transfer",
        args: [BRIDGE_ADDRESS, parsedAmount],
      });

      setTxHash(hash);

      // Wait a bit for UI
      setTimeout(() => {
        if (onSuccess) onSuccess();
        onClose();
      }, 2000);
    } catch (err) {
      console.error("Deposit failed:", err);
      setError(err instanceof Error ? err.message : "Deposit failed");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Deposit into Hyperliquid</DialogTitle>
          <DialogDescription>
            You need to deposit funds to initialize your trading account.
            Minimum deposit: 5 USDC.
          </DialogDescription>
        </DialogHeader>

        <div className="py-4 space-y-4">
          <div className="bg-secondary/50 p-4 rounded-lg space-y-2">
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Bridge Address</span>
              <span className="font-mono text-xs">
                {BRIDGE_ADDRESS.slice(0, 6)}...{BRIDGE_ADDRESS.slice(-4)}
              </span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Your USDC Balance</span>
              <span className="font-medium">
                {isBalanceLoading
                  ? "..."
                  : balanceData
                    ? `${parseFloat(formatUnits(balanceData.value, 6)).toFixed(2)} USDC`
                    : "0.00"}
              </span>
            </div>
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium">Amount (USDC)</label>
            <div className="flex gap-2">
              <Input
                type="number"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="0.00"
                min="5"
              />
              <Button
                variant="outline"
                onClick={() =>
                  setAmount(
                    balanceData ? formatUnits(balanceData.value, 6) : "0",
                  )
                }
              >
                Max
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              Funds will be credited automatically in ~1 minute.
            </p>
          </div>

          {error && (
            <div className="p-3 bg-destructive/10 text-destructive text-sm rounded-lg break-words">
              {error}
            </div>
          )}

          {txHash && (
            <div className="p-3 bg-green-500/10 text-green-500 text-sm rounded-lg break-words">
              Deposit Sent! Tx: {txHash.slice(0, 10)}...
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button
            onClick={handleDeposit}
            disabled={isLoading || !amount || parseFloat(amount) < 5}
          >
            {isLoading && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
            Deposit {amount} USDC
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
