// Shim for @zama-fhe/react-sdk/wagmi compatibility.
// The SDK was compiled against an older wagmi that exported different names.
// This re-exports everything from wagmi/actions and aliases the old names.
export * from 'wagmi/actions';
export { watchConnections as watchConnection } from 'wagmi/actions';
export { getAccount as getConnection } from 'wagmi/actions';
