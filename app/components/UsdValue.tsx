import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { safeBigInt, formatUsd, formatTokenAmount } from '@/lib/utils';

interface UsdValueProps {
  amount: string;
  decimals: number;
  priceUsd: number;
  symbol: string;
}

export function UsdValue({ amount, decimals, priceUsd, symbol }: UsdValueProps) {
  const bigVal = safeBigInt(amount);
  if (bigVal <= 0n) {
    return (
      <span className="tabular-nums" aria-label="$0.00">
        $0.00
      </span>
    );
  }
  // BigInt-safe conversion to avoid Number precision loss for large values
  const divisor = 10n ** BigInt(decimals);
  const whole = bigVal / divisor;
  const remainder = bigVal % divisor;
  // Use string-based conversion to avoid Number precision loss for large values
  const fracStr = remainder.toString().padStart(decimals, '0');
  const tokenValue = parseFloat(`${whole}.${fracStr}`);
  const usdValue = tokenValue * priceUsd;
  const rawTokenStr = formatTokenAmount(amount, decimals);

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <span className="cursor-help tabular-nums" tabIndex={0} aria-label={`${formatUsd(usdValue)} — focus for token breakdown`}>
            {formatUsd(usdValue)}
          </span>
        </TooltipTrigger>
        <TooltipContent>
          <p className="font-mono text-xs">
            {rawTokenStr} {symbol}
          </p>
          <p className="text-xs text-muted-foreground">
            @ ${priceUsd.toFixed(4)} per {symbol}
          </p>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
