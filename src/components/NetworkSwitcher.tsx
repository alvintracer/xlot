import { useChainId, useSwitchChain } from "wagmi";

export function NetworkSwitcher() {
  const chainId = useChainId();
  const { chains, switchChain } = useSwitchChain();

  return (
    <div className="relative inline-block text-left">
      <select 
        value={chainId}
        onChange={(e) => switchChain({ chainId: Number(e.target.value) })}
        className="bg-gray-100 text-gray-700 font-bold py-1 px-3 rounded-full text-xs outline-none cursor-pointer hover:bg-gray-200"
      >
        {chains.map((chain) => (
          <option key={chain.id} value={chain.id}>
            {chain.name}
          </option>
        ))}
      </select>
    </div>
  );
}