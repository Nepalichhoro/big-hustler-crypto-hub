# Lock 
## I promise not to vote below this round again

Step 2: How does a replica update lockedRound?

Rule (simplified HotStuff):

When replica votes for block B:
  if justifyQC.round > lockedRound:
      lockedRound = justifyQC.round


So:

lockedRound only increases