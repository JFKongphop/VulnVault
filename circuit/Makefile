c-com:
	mkdir -p proof-source
	circom bountyClaim.circom --r1cs --wasm -o proof-source

c-p1:
	snarkjs powersoftau new bn128 15 proof-source/pot15_0000.ptau -v

c-p2:
	snarkjs powersoftau contribute proof-source/pot15_0000.ptau proof-source/pot15_final.ptau --name="contributor" -v

c-final:
	snarkjs powersoftau prepare phase2 proof-source/pot15_final.ptau proof-source/pot15_final_phase2.ptau

zkey:
	snarkjs groth16 setup proof-source/bountyClaim.r1cs proof-source/pot15_final_phase2.ptau proof-source/bountyClaim.zkey

vkey:
	snarkjs zkey export verificationkey proof-source/bountyClaim.zkey proof-source/verification_key.json

gen-con:
	snarkjs zkey export solidityverifier proof-source/bountyClaim.zkey ../contracts/BountyClaimVerifier.sol

c-full:
	make c-com && make c-p1 && make c-p2 && make c-final && make zkey && make vkey && make gen-con