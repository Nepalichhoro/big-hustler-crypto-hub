Leader proposes using QCs; replicas enforce safety using locks.

In HotStuff, a proposal is only accepted if it proves the system already agreed to move forward, and that proof (QC) advances locks in a way that makes conflicting commits impossible.