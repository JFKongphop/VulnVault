// Shim for @zama-fhe/react-sdk/wagmi compatibility.
// The SDK was compiled against an older wagmi version that exported `useConnection`.
// Wagmi v2 removed `useConnection` — `useAccount` is the equivalent.
// This re-exports everything from wagmi and aliases the old name.
export * from 'wagmi';
export { useAccount as useConnection } from 'wagmi';
