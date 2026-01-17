// Wagmi Configuration with Web3Modal

import { defaultWagmiConfig } from '@web3modal/wagmi/react/config';
import { arbitrum } from 'wagmi/chains';

// WalletConnect Project ID
export const projectId = 'c58ac3f141e930783d46400601b12b3a';

// Metadata
const metadata = {
  name: 'TradeTok',
  description: 'Social trading platform for pair trades',
  url: 'https://tradetok.app',
  icons: ['https://tradetok.app/icon.png']
};

// Pear Protocol uses Arbitrum (chainId: 42161)
const chains = [arbitrum] as const;

// Create wagmi config
export const config = defaultWagmiConfig({
  chains,
  projectId,
  metadata,
  enableWalletConnect: true,
  enableInjected: true,
  enableEIP6963: true,
  enableCoinbase: true,
});
