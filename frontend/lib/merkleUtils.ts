/**
 * Merkle path computation for the VulnVault BugBountyMerkleTree.
 *
 * The on-chain tree is a Tornado Cash-style 20-level incremental Merkle tree
 * using Poseidon2 hashing (circomlib Poseidon). Zero values are pre-computed
 * as ZEROS[0]=0, ZEROS[i+1]=poseidon2(ZEROS[i], ZEROS[i]).
 */
import { poseidon2 } from 'poseidon-lite';

export const TREE_LEVELS = 20;

/**
 * Pre-computed Poseidon-based zero values (from MerkleTree.sol constants).
 * ZEROS[0] = 0, ZEROS[i] = poseidon2(ZEROS[i-1], ZEROS[i-1])
 */
export const ZEROS: bigint[] = [
  0n,
  14744269619966411208579211824598458697587494354926760081771325075741142829156n,
  7423237065226347324353380772367382631490014989348495481811164164159255474657n,
  11286972368698509976183087595462810875513684078608517520839298933882497716792n,
  3607627140608796879659380071776844901612302623152076817094415224584923813162n,
  19712377064642672829441595136074946683621277828620209496774504837737984048981n,
  20775607673010627194014556968476266066927294572720319469184847051418138353016n,
  3396914609616007258851405644437304192397291162432396347162513310381425243293n,
  21551820661461729022865262380882070649935529853313286572328683688269863701601n,
  6573136701248752079028194407151022595060682063033565181951145966236778420039n,
  12413880268183407374852357075976609371175688755676981206018884971008854919922n,
  14271763308400718165336499097156975241954733520325982997864342600795471836726n,
  20066985985293572387227381049700832219069292839614107140851619262827735677018n,
  9394776414966240069580838672673694685292165040808226440647796406499139370960n,
  11331146992410411304059858900317123658895005918277453009197229807340014528524n,
  15819538789928229930262697811477882737253464456578333862691129291651619515538n,
  19217088683336594659449020493828377907203207941212636669271704950158751593251n,
  21035245323335827719745544373081896983162834604456827698288649288827293579666n,
  6939770416153240137322503476966641397417391950902474480970945462551409848591n,
  10941962436777715901943463195175331263348098796018438960955633645115732864202n,
];

/**
 * Compute a Merkle inclusion proof for a leaf at the given index.
 *
 * @param leaves  All leaves in the tree (as BigInt field elements), in insertion order.
 * @param leafIndex  The 0-based index of the leaf to prove.
 * @returns pathElements and pathIndices arrays for the ZK circuit (length = TREE_LEVELS).
 */
export function computeMerklePath(
  leaves: bigint[],
  leafIndex: number,
): { pathElements: bigint[]; pathIndices: number[] } {
  const pathElements: bigint[] = [];
  const pathIndices: number[] = [];

  let currentLevel = [...leaves];
  let currentIndex = leafIndex;

  for (let level = 0; level < TREE_LEVELS; level++) {
    // Determine if this node is a right child (odd index)
    const isRight = currentIndex % 2 === 1;
    pathIndices.push(isRight ? 1 : 0);

    // Sibling is adjacent node; fall back to zero if beyond actual leaves
    const siblingIndex = isRight ? currentIndex - 1 : currentIndex + 1;
    const sibling =
      siblingIndex < currentLevel.length ? currentLevel[siblingIndex] : ZEROS[level];
    pathElements.push(sibling);

    // Build the next level by hashing pairs
    const nextLevel: bigint[] = [];
    for (let i = 0; i < currentLevel.length; i += 2) {
      const left = currentLevel[i];
      const right = i + 1 < currentLevel.length ? currentLevel[i + 1] : ZEROS[level];
      nextLevel.push(poseidon2([left, right]));
    }

    currentLevel = nextLevel;
    currentIndex = Math.floor(currentIndex / 2);
  }

  return { pathElements, pathIndices };
}

/**
 * Find the index of a leaf (by value) in an array of leaves.
 * Returns -1 if not found.
 */
export function findLeafIndex(leaves: bigint[], target: bigint): number {
  return leaves.findIndex((l) => l === target);
}
