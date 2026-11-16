// 课程登记表：所有可以打开的课。每节课用 where: [[科目, 章节], ...] 挂到考纲目录上，
// 一节综合课可以同时出现在几门课下面。
import { makeCacheMap } from './subjects/co/cachemap-lesson.js';
import { makeFp } from './subjects/co/fp-lesson.js';
import { makeDijkstra } from './subjects/ds/dijkstra-lesson.js';
import { makeHash } from './subjects/ds/hash-lesson.js';
import { makeHeap } from './subjects/ds/heap-lesson.js';
import { makeQuicksort } from './subjects/ds/qsort-lesson.js';
import { makeTraverse } from './subjects/ds/trav-lesson.js';
import { makeRebuild } from './subjects/ds/rebuild-lesson.js';
import { makeAvl } from './subjects/ds/avl-lesson.js';
import { makePipe } from './subjects/co/pipe-lesson.js';
import { MEM_LESSON, makeMemLesson } from './subjects/mem/index.js';
import { makeCC } from './subjects/net/cc-lesson.js';
import { NET_LESSONS } from './subjects/net/index.js';
import { makeSubnet } from './subjects/net/subnet-lesson.js';
import { makeSW } from './subjects/net/sw-lesson.js';
import { makeCsma } from './subjects/net/csma-lesson.js';
import { makeNat } from './subjects/net/nat-lesson.js';
import { makeArp } from './subjects/net/arp-lesson.js';
import { makeDelay } from './subjects/net/delay-lesson.js';
import { makeNyquist } from './subjects/net/limit-lesson.js';
import { makeEncoding } from './subjects/net/enc-lesson.js';
import { makeRip } from './subjects/net/rip-lesson.js';
import { makeLpm } from './subjects/net/lpm-lesson.js';
import { makeFrag } from './subjects/net/frag-lesson.js';
import { makeCrc } from './subjects/net/crc-lesson.js';
import { makeDisk } from './subjects/os/disk-lesson.js';
import { makeIoBuf, makeIoCtrl } from './subjects/os/io-lesson.js';
import { makeAddr } from './subjects/os/addr-lesson.js';
import { makeEat } from './subjects/os/eat-lesson.js';
import { makeBitmap, makeFileIndex } from './subjects/os/file-lesson.js';
import { makeInterrupt } from './subjects/os/intr-lesson.js';
import { makeBanker } from './subjects/os/banker-lesson.js';
import { makeProc } from './subjects/os/proc-lesson.js';
import { makeSem } from './subjects/os/sem-lesson.js';
import { makePartition } from './subjects/os/partition-lesson.js';
import { makePaging } from './subjects/os/paging-lesson.js';
import { makeSched } from './subjects/os/sched-lesson.js';

import { makeSearch, makeMst, makeTopo, makeCritical, makeFloyd } from './subjects/ds/graph-lessons.js';

import { makeBsearch, makeBst, makeBtree } from './subjects/ds/search-lessons.js';

import { makeThread, makeForest, makeHuffman, makeUnionFind } from './subjects/ds/tree-lessons.js';

import { makeLinked, makeStackSeq, makeInfix, makeCqueue, makeMatrix } from './subjects/ds/linear-lessons.js';

import { makeComplexity, makeExtSort, makeSortPasses } from './subjects/ds/sort-lessons.js';

import { makeAddSub, makeDivide, makeEncodings, makeEndian, makeFloatAdd, makeMultiply } from './subjects/co/arith-lessons.js';

import { makeHamming, makePerf } from './subjects/co/sys-lessons.js';

import { makeCacheAddr, makeCacheWrite, makeInterleave, makeMemExt } from './subjects/co/mem-lessons.js';

import { makeAddressing, makeCmpJump, makeOpcode } from './subjects/co/isa-lessons.js';

import { makeBranch, makeDatapath, makeMicro, makePipePerf } from './subjects/co/cpu-lessons.js';

import { makeBusArb, makeDma, makeIntMask } from './subjects/co/bus-lessons.js';

import { makeKmp } from './subjects/ds/string-lesson.js';

import { makeRbTree } from './subjects/ds/rbtree-lesson.js';

import { makeLinkedSQ } from './subjects/ds/linkq-lesson.js';

import { makeGraphStore } from './subjects/ds/gstore-lesson.js';

import { makeCountingSort } from './subjects/ds/csort-lesson.js';

import { makeLlAlgo } from './subjects/ds/llalgo-lesson.js';

import { makeCtxSwitch } from './subjects/os/ctxsw-lesson.js';

import { makeOpenFile } from './subjects/os/openfile-lesson.js';

import { makeFileLink } from './subjects/os/links-lesson.js';

import { makeWorkingSet } from './subjects/os/wset-lesson.js';

import { makeEncap } from './subjects/net/encap-lesson.js';

import { makeSwitch } from './subjects/net/switch-lesson.js';

import { makeFraming } from './subjects/net/framing-lesson.js';

import { makeMux } from './subjects/net/mux-lesson.js';

import { makeUdp } from './subjects/net/udp-lesson.js';

import { makeTcpFlow } from './subjects/net/tcpflow-lesson.js';

import { makeOspf } from './subjects/net/ospf-lesson.js';

import { makeFtp } from './subjects/net/ftp-lesson.js';

import { makeEmail } from './subjects/net/email-lesson.js';

import { makeIntCast } from './subjects/co/cast-lesson.js';

import { makeCtrlAsm } from './subjects/co/ctrl-lesson.js';

import { makeCallFrame } from './subjects/co/frame-lesson.js';

import { makeSsd } from './subjects/co/ssd-lesson.js';

import { makeBusTiming } from './subjects/co/bustime-lesson.js';

import { makeMemImage } from './subjects/os/memimg-lesson.js';

import { makeDiskTime } from './subjects/os/disktime-lesson.js';

import { makeFileAlloc } from './subjects/os/filealloc-lesson.js';

import { makeSyncClassic } from './subjects/os/syncclassic-lesson.js';

export const CATALOG = [
  MEM_LESSON,
  makeComplexity(),
  makeGraphStore(),
  makeDijkstra(),
  makeSearch(),
  makeMst(),
  makeTopo(),
  makeCritical(),
  makeFloyd(),
  makeHash(),
  makeLinked(),
  makeLlAlgo(),
  makeStackSeq(),
  makeInfix(),
  makeCqueue(),
  makeLinkedSQ(),
  makeMatrix(),
  makeKmp(),
  makeBsearch(),
  makeBst(),
  makeBtree(),
  makeTraverse(),
  makeRebuild(),
  makeThread(),
  makeForest(),
  makeHuffman(),
  makeUnionFind(),
  makeAvl(),
  makeRbTree(),
  makeHeap(),
  makeQuicksort(),
  makeSortPasses(),
  makeCountingSort(),
  makeExtSort(),
  makePerf(),
  makeEncodings(),
  makeIntCast(),
  makeAddSub(),
  makeMultiply(),
  makeDivide(),
  makeFp(),
  makeFloatAdd(),
  makeEndian(),
  makeHamming(),
  makeMemExt(),
  makeCacheAddr(),
  makeCacheMap(),
  makeCacheWrite(),
  makeInterleave(),
  makeSsd(),
  makeOpcode(),
  makeAddressing(),
  makeCmpJump(),
  makeCtrlAsm(),
  makeCallFrame(),
  makeDatapath(),
  makeMicro(),
  makePipePerf(),
  makePipe(),
  makeBranch(),
  makeBusArb(),
  makeBusTiming(),
  makeIntMask(),
  makeDma(),
  makeInterrupt(),
  makeMemImage(),
  makeProc(),
  makeCtxSwitch(),
  makeSched(),
  makeSem(),
  makeSyncClassic(),
  makeBanker(),
  makePartition(),
  makeAddr(),
  makeEat(),
  makePaging(),
  makeWorkingSet(),
  makeFileIndex(),
  makeFileAlloc(),
  makeBitmap(),
  makeOpenFile(),
  makeFileLink(),
  makeIoCtrl(),
  makeIoBuf(),
  makeDisk(),
  makeDiskTime(),
  makeEncap(),
  makeDelay(),
  makeSW(),
  makeFraming(),
  makeCsma(),
  makeCrc(),
  makeSwitch(),
  ...NET_LESSONS,
  makeSubnet(),
  makeFrag(),
  makeLpm(),
  makeArp(),
  makeNat(),
  makeRip(),
  makeOspf(),
  makeCC(),
  makeUdp(),
  makeTcpFlow(),
  makeEncoding(),
  makeNyquist(),
  makeMux(),
  makeFtp(),
  makeEmail(),
];

export const lessonById = (id) => CATALOG.find((l) => l.id === id);

/** 用新生成的课替换同 id 的旧课（参数可调的课，改参数后整节课重新生成） */
export function replaceLesson(lesson) {
  const i = CATALOG.findIndex((l) => l.id === lesson.id);
  if (i >= 0) CATALOG[i] = lesson;
  return lesson;
}

export const lessonsIn = (subj, chap) => CATALOG.filter((l) => l.where.some(([s, c]) => s === subj && (chap == null || c === chap)));

export { makeMemLesson };
