# code-map 插件评测：速度 / 准确性 / 功能完备性

> 基于 2026-06-07 一次真实的 `/add-code-map https://github.com/FreeRTOS/FreeRTOS-Kernel.git`
> 全流程（内部即 `/code-map:build` 的 Phase 0/1/2）得出的第一手观察。
> 被测插件版本：`code-map 1.5.2`（`~/.claude/plugins/cache/code-map/code-map/1.5.2`）。
> 被测对象：FreeRTOS-Kernel（C，约 290 个 `.c` + 370 个 `.h`，重度宏 / 预处理）。
>
> 结论按 **运行速度 / 分析准确性 / 功能完备性** 三个方向给出，每条尽量附**实测证据**
> （命令、计时、源码 `file:line`），末尾有改进优先级总表与复现实验。

---

## 0. 一句话结论

引擎的**骨架（图谱构建 / 分层 / 流程 / 增量 / 多语言）设计扎实、速度足够快**；最大的短板集中在
**C/C++ 这类「预处理 + 宏」语言的提取准确性**上——在 FreeRTOS 这种典型嵌入式内核上，**最重要的几个文件几乎被整体漏掉**（`tasks.c` 119 个函数只提取出 1 个，`timers.c`/`croutine.c` 提取出 0 个），不做人工兜底根本无法产出可用的架构图。

---

## 一、运行速度

### 实测数据

| 场景 | 文件数 | 声明数 | 耗时 (real) |
|---|---|---|---|
| `analyze --detect-only`（仅探测模板） | — | — | **0.09 s** |
| `analyze` 全量（已 skip 冗余端口，36 文件） | 36 | 109 | **0.33 s** |
| `analyze` 全量（仅 skip `.git`，整棵树） | 658 | 1688 | **2.61 s** |

> 测量：`/usr/bin/time -p "$BIN" analyze --root "$CACHE" --out /tmp/x.json --no-git-history`
> （C 语法 WASM 已缓存的稳定态）。

**换算**：约 **4 ms/文件**，单线程、随文件数近似线性。在中小型仓库（≤ 数千文件）完全无感。

### 观察与结论

1. **速度在当前规模不是瓶颈**，引擎本身很轻（纯 web-tree-sitter + WASM，无外部进程，无 Python）。
2. **提取是严格串行的**：`analyze.mjs:105` 的 `for (const path of files) { … await extractor.parse(...) }` 逐文件 `await`，没有 worker 并行。解析是 CPU 密集且**文件间完全独立**，这是最自然的并行点。一个 10k+ 文件的大型 monorepo 会线性放大到几十秒，并行（`worker_threads` 分片文件）可近似按核数提速。
3. **首次运行有隐藏延迟**：6 个较大的语法 WASM 是「首次用到时联网拉取并缓存」。第一次对某语言建图会比上表慢，且**依赖网络**——离线首跑会落入 `grammar_*_unavailable_offline`（见 `analyze.mjs:119`）。文档应更醒目地提示「首次需联网预热语法」。
4. **增量构建（Path B）已实现且有效**：`incremental.mjs` 依据 git diff 决定是否复用上次结果，避免全量重解析——这是对速度最有价值的已有特性。
5. **git-history 用 `git log -n 200 --name-only` 一次抓取**（`scripts/lib/gitmeta.mjs`），`maxBuffer` 给到 512 MB，超大仓库会吃内存，但 200 条上限下无虞。

### 建议（速度方向）

- **P2**：把 Phase 1 提取并行化（worker 池分片文件），对大仓库收益明显。
- **P3**：语法 WASM 预热做成显式命令（`code-map warmup`）或在首跑时打印「正在下载语法」进度，改善离线/首跑体验。

---

## 二、分析准确性 ⚠️（最需要改进）

这一节是本次评测发现问题最集中、也最严重的方向。下列每条都有实测证据。

### 2.1【严重】C 提取器只看 `translation_unit` 的直接子节点 → 预处理块内的函数全丢

`c.mjs:123` 的提取循环是 `for (const c of root.children)`——**只遍历根节点的直接子节点**。而 C 内核大量把整段代码包在条件编译里：

```c
/* timers.c 全文被包在 */
#if ( configUSE_TIMERS == 1 )
   ... 所有定时器函数 ...   /* ← 这些是 preproc_if 的「孙节点」，被完全跳过 */
#endif
```

实测（用插件自带 `ts.mjs` 解析）：

| 文件 | 真实顶层函数 | 顶层 ERROR 节点 | 提取器拿到的函数 |
|---|---|---|---|
| `queue.c` | 24 | 5 | 24 ✅ |
| `tasks.c`（362 KB） | 多数被 ERROR 吞没 | **8** | **1** ❌ |
| `timers.c` | 0（全在 `#if` 内） | 0 | **0** ❌ |
| `croutine.c` | 0（全在 `#if` 内） | 0 | **0** ❌ |

两种失效模式：
- **预处理包裹**：函数是 `preproc_if`/`preproc_ifdef` 的子节点，根遍历看不到（`timers.c`/`croutine.c` → 0）。
- **ERROR 恢复**：超大/复杂文件让 tree-sitter 在顶层产生 ERROR 节点，吞掉后续定义（`tasks.c` → 1/119）。

**影响面**：任何「预处理/宏密集」的 C/C++ 项目（RTOS、嵌入式、Linux 内核风格、带大量 `#ifdef FEATURE` 的库）都会被严重低估。本次必须自写一个递归进 `preproc_*`/`ERROR` 的驱动才把声明从 **114 救回到 421**。

**建议（P0）**：C/C++ 提取改为**递归下降**穿透「透明容器」节点（`translation_unit`/`preproc_if`/`preproc_ifdef`/`preproc_else`/`preproc_elif`/`linkage_specification`/`declaration_list`/`ERROR`）来收集 `function_definition`/`type_definition`/`struct|union|enum`，并对 `#if`/`#else` 分支同名定义按文件去重。这是把 C 支持从「玩具级」提升到「可用级」的最关键改动。

### 2.2【严重】宏定义的函数完全不可见

FreeRTOS 用 `portTASK_FUNCTION( prvTimerTask, pvParameters )` 这种**函数样式宏**来声明任务函数。tree-sitter 把它看作宏调用而非 `function_definition`，于是：

```
$ grep -n "portTASK_FUNCTION( prvTimerTask" timers.c
744:    static portTASK_FUNCTION( prvTimerTask, pvParameters )
# 在生成的图谱里:
prvTimerTask present in map: false        ← 定时器守护任务本体（timers.c 最核心的函数）丢失
```

即使修了 2.1，宏定义的函数仍然抓不到。**影响**：内核里「最重要的那个函数」恰恰常用宏定义。

**建议（P1）**：对 C/C++ 维护一张「函数样式宏」白名单（可由用户在 `architecture.yml` 旁配置），或对「`IDENT( IDENT, … ) {` 紧跟代码块」的模式做启发式识别，补回这些声明。

### 2.3【中】同名多实现的调用边解析武断

C 内核常按编译配置在多个文件里给出**同名的可选实现**。`pvPortMalloc` 在 `heap_1..heap_4` 各有一份定义：

```
pvPortMalloc definitions: 4  (heap_1 | heap_2 | heap_3 | heap_4)
edges resolving to pvPortMalloc: 2  ->  heap_2.pvPortMalloc, heap_4.pvPortMalloc
```

`core.mjs:95` 的 `resolve()` 用「短名 + 同文件 + public 唯一」做消歧，多份 public 同名实现时只能**任选**（这里命中了 heap_2/heap_4），调用边因此指向**错误或不确定**的实现。**影响**：以「配置选择实现」为常态的 C/嵌入式项目，调用图与流程会失真。

**建议（P2）**：对同名多 public 实现，要么**不连边**（标注为「配置选择，运行期决定」），要么折叠为一个虚拟节点 + 多实现展开，避免给出误导性的确定边。

### 2.4【中】入口点启发式偏 JVM/Android，且有误报

`core.mjs:5` 的 `ENTRY_POINT_HINTS` 是 `MainActivity`/`Application`/`Bootstrap`/`Container`/`/cmd/` 等——明显面向 Android/Java/Go。在 C 上：
- **漏报**：真正的内核入口 `vTaskStartScheduler` 不匹配任何规则（本次需在 Phase 2 手动打 `entry-point`）。
- **误报**：`name_suffix: ['…','Container']`（本意指 DI 容器）把 `prvNotifyQueueSetContainer`（队列集容器，与 DI 毫无关系）**误判为入口点**，本次需手动清除。

**建议（P2）**：入口点规则**按语言/生态分组**（C：`main`/`*_main`/中断向量；Rust：`fn main`/`#[tokio::main]`；Go：`/cmd/`；JVM：现有规则），并让 `Container`/`App` 这类宽后缀更保守（要求更强证据）。

### 2.5【中】模板探测对 C/系统语言「零信号」

`detection.scores` 对本项目**全为 0**（`clean-architecture=0, cli-tool=0, …`）。探测器的信号集中在 `build.gradle`/`package.json`/`pom.xml`/OSGi/pluggy 等 JVM/Web 生态标志，对 C/C++/CMake/Kconfig/嵌入式**几乎没有信号**。结果：C 项目的 Phase 0 完全靠人判断，新手很容易误套一个应用层模板到「库/框架」上。

**建议（P2）**：补充 C/系统语言信号——`CMakeLists.txt`/`Kconfig`/`Makefile`/`*.ld`/`portable|arch|bsp|hal|drivers` 目录名 → 提高 `microkernel`/`layered` 权重；并在 `templateFit.fits=false` 或「检测全 0」时更强烈地提示「按功能子系统自定义分层」。

### 2.6【轻】分层匹配对「扁平/根目录文件」支持弱

`layers.mjs` 的 `assignLayer` 用 path-segment **从右往左**匹配。根目录的 `tasks.c`/`queue.c` 没有目录段，只能靠**文件名 stem** 命中。各内置模板的 `path_segments` 都是目录式（`presentation`/`domain`/`data`），对「根目录摊平一堆 `.c`」的布局会**整体落入 uncategorized**。本次靠把 `tasks`/`queue` 等**文件名**写进 `path_segments` 才救回。

**建议（P3）**：文档明确「`path_segments` 也会匹配文件名 stem」；或为扁平 C 布局提供示例模板。

### 2.7【轻】`fit.fits` 与「空图层」信号不一致

首跑时 4 个图层为空（`empty_layers: [api,timers,coroutine,port]`），但 `fit.fits` 仍为 `true`。空图层是「分层/提取有问题」的强信号，却没拉低 `fits`。

**建议（P3）**：把「非平凡的空图层数量」纳入 `fits` 判定或单独告警。

---

## 三、功能完备性

### 已具备且实现良好 ✅

- **三阶段流水线**：Phase 0（AI 设计架构）/ Phase 1（tree-sitter 机械提取）/ Phase 2（AI 语义精炼），职责清晰。
- **增量构建（Path B）**：`incremental.mjs` 按 git diff 决定全量/增量并合并旧标注，是体验/速度关键特性。
- **13 套架构模板** + 探测器 + `templateFit` 反馈回路（`uncategorized_pct`/`empty_layers`/`largest_layer_pct`）。
- **多语言**：kotlin/java/python/go/rust/ts(js)/c/cpp/csharp/swift/objc/lua/dart 共 13 种（`extractors/index.mjs`）。
- **多态/分发索引**：`buildDispatchIndex` 找出「≥2 实现的接口」并生成 dispatch 流（适配 OO 的拦截器链/策略/观察者）。
- **业务流程**：BFS 流 + dispatch 流 + `suppressSubsets` 子集抑制。
- **vendored 泛滥告警** + 可配置 `skip-dirs.txt`（支持 `-name` 取消默认跳过）。
- **git-history 侧车**：`analyze.mjs:182` **插件已自带生成**（本次实测 `[analyze] wrote git-history.json (200 commits)`）。
  > 备注：本仓库 `scripts/git-history.mjs` 与 `/add-code-map` 步骤 5 的注释「插件不产出 git-history」**已与现实不符**（属本仓库文档滞后，非插件缺陷），可考虑直接复用插件产物。

### 缺失/可补强的功能 🔧

1. **【P0】C/C++ 预处理 + 宏支持**（见 2.1、2.2）——当前完备性的最大缺口。
2. **【P2】C/Go 的函数指针 / 回调表分发**：C 的「多态」靠结构体里的函数指针（如 `pxCallbackFunction`、port 的 `pxPortInitialiseStack`）。`buildDispatchIndex` 只认 OO 接口的 `supertypes`，对 C 的 vtable/回调表**完全不可见**，dispatch 索引在本项目为空。可识别「结构体成员为函数指针 + 被赋值的具体函数」来还原 C 的责任链/策略。
3. **【P2】并行提取**（见一·2）。
4. **【P2】构建系统感知分层**：`ownRoots` 只解析 gradle/maven/pom（`vendoring.mjs`）。CMake target、Cargo workspace、Go module、Bazel 包都能反推「自有代码根」与天然模块边界，目前未用。
5. **【P3】更丰富的覆盖叠加**：git-history 已有 per-commit 改动文件，但未做 **per-声明 churn 热度**叠加；也无测试覆盖率 overlay。这些能让「架构图」升级为「架构 + 风险图」。
6. **【P3】流程去重偏弱**：`suppressSubsets` 只做严格子集抑制，对「节点集高度相似但非子集」的近重复流程（本次 `xQueueReceive` 与 `xQueuePeek` 节点完全一致）不会合并，需人工裁剪。可加「Jaccard 相似度阈值合并」。
7. **【P3】语言覆盖**：缺 Ruby/PHP/Scala/Zig 等；按生态需求可扩。

---

## 四、改进优先级总表

| 优先级 | 方向 | 问题 | 建议 |
|---|---|---|---|
| **P0** | 准确性/完备 | C/C++ 提取漏掉 `#if` 内 / ERROR 内的函数（2.1） | 递归穿透透明容器节点 + 分支去重 |
| **P0** | 准确性 | 宏定义的函数完全不可见（2.2） | 函数样式宏白名单/启发式 |
| **P1** | 准确性 | 内核最核心函数（宏定义）丢失，连带流程失真 | 同 P0-2.2 |
| **P2** | 准确性 | 同名多实现的调用边武断（2.3） | 不连边或虚拟节点展开 |
| **P2** | 准确性 | 入口点启发式偏 JVM 且误报（2.4） | 规则按语言分组、宽后缀更保守 |
| **P2** | 准确性 | 模板探测对 C/系统语言零信号（2.5） | 补 CMake/Kconfig/目录名信号 |
| **P2** | 完备 | 无 C/Go 函数指针分发识别 | 识别结构体函数指针 + 赋值 |
| **P2** | 速度 | 提取串行，大仓库慢 | worker 并行分片 |
| **P3** | 准确性 | 扁平/根文件分层弱（2.6）、`fits` 漏报空层（2.7） | 文档+模板；空层纳入 fits |
| **P3** | 完备 | 流程近重复不合并、覆盖叠加缺失、语言覆盖 | 相似度合并、churn overlay、扩语言 |

---

## 五、复现实验（命令清单）

```bash
CACHE="$HOME/.cache/code-map-showcase/freertos-kernel"        # /add-code-map 的全量克隆
BIN="$HOME/.claude/plugins/cache/code-map/code-map/1.5.2/bin/code-map"

# 速度
/usr/bin/time -p "$BIN" analyze --root "$CACHE" --detect-only
/usr/bin/time -p "$BIN" analyze --root "$CACHE" --out /tmp/x.json --no-git-history

# 准确性：tree-sitter 顶层函数 vs ERROR（用插件自带 ts.mjs）
PLUGIN="$HOME/.claude/plugins/cache/code-map/code-map/1.5.2"
node --input-type=module -e '
import { init, loadLanguage, Parser } from "'"$PLUGIN"'/scripts/lib/ts.mjs";
import { readFileSync } from "node:fs"; await init(); const L=await loadLanguage("c");
for (const f of ["tasks.c","queue.c","timers.c","croutine.c"]) {
  const r=new Parser(); r.setLanguage(L);
  const root=r.parse(readFileSync("'"$CACHE"'/"+f,"utf8")).rootNode;
  let fn=0,err=0; for (const c of root.children){if(c.type==="function_definition")fn++;if(c.type==="ERROR")err++;}
  console.log(f, "topFns="+fn, "topERR="+err);
}'
```

> 本次为绕过 2.1/2.2，自写的兜底脚本仍保留在 `~/.cache/code-map-showcase/freertos-kernel/.code-map/`
> （`extract-enhanced.mjs` = 复用插件库 + 递归 C 提取的 analyze 复刻；`phase2.mjs` = 描述/流程注入），
> 可作为「修复后插件应有行为」的参考实现。
