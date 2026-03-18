const fs = require('fs');
const data = JSON.parse(fs.readFileSync('/tmp/samuel_new_positions.json', 'utf8')).response;
for (const p of data) {
  const earned = p.totalClaimableLamportsUserShare || 0;
  const virtual = p.virtualPoolClaimableLamportsUserShare || 0;
  const damm = p.dammPoolClaimableLamportsUserShare || 0;
  const vault = p.userVaultClaimableLamportsUserShare || 0;
  const unclaimed = virtual + damm + vault;
  const claimed = earned > unclaimed ? earned - unclaimed : 0;
  console.log(`Token: ${p.baseMint.slice(0, 6)}\nEarned: ${earned}\nUnclaimed: ${unclaimed}\nClaimed: ${claimed}\n`);
}
