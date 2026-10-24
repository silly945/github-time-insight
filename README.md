# GitHub Time Insight

> 我们每天都在 GitHub 上度过一段时间，
> 却从没有人告诉我们，这些时间去哪儿了。
>
> *Every day we spend a little life on GitHub —*
> *and no one ever tells us where that time went.*

---

它不催你，不评分，不联网。
它只是安静地坐在角落里，替你把日子数清楚。

*It doesn't push you, grade you, or flatter you.*
*It just sits quietly in the corner and counts your days for you.*

---

## 它替你回答的问题 · The questions it answers for you

| 中文 | English |
|---|---|
| 这个月，我有多少个小时，是在 GitHub 上度过的？ | How many hours of this month did I actually spend on GitHub? |
| 其中多少是写代码，多少是在读别人写的代码？ | How much of it was writing code, and how much was reading someone else's? |
| 我在哪几个仓库上停留最久？ | Which repositories held me the longest? |
| 我最近打开的十个页面，是些什么内容？ | What were the last ten pages I opened? |
| 我是不是在某个下午，对着同一个页面发呆了四十分钟？ | Did I really sit on the same page for forty minutes one afternoon? |

它把这些数字，画成一条安静的时间线。
你打开它，看见的不是报表，是一段自己的日子。

*It draws these numbers into a quiet timeline.*
*What you open is not a report. It's a piece of your own life.*

---

## 怎么装 · How to install

### 方式一：开发者模式加载（推荐）· Load as an unpacked extension (recommended)

1. 下载本仓库，解压到任意文件夹。
2. 打开 Chrome、Edge 或 Kiwi 浏览器，进入 `chrome://extensions/`。
3. 打开右上角「开发者模式」。
4. 点击「加载已解压的扩展程序」，选择解压后的文件夹。
5. 完成。打开 GitHub，右下角会出现一个小小的圆点。

*1. Download this repository and unzip it anywhere.*
*2. Open Chrome, Edge, or Kiwi and go to `chrome://extensions/`.*
*3. Turn on "Developer mode" in the top-right corner.*
*4. Click "Load unpacked" and choose the unzipped folder.*
*5. Done. Open GitHub — a small dot appears in the bottom-right corner.*

### 方式二：打包安装 · Packaged install

在扩展管理页点击「打包扩展程序」，生成 `.crx` 后拖入浏览器窗口。
*Click "Pack extension" on the extensions page, then drag the resulting `.crx` into the browser.*

---

## 那一个小圆点 · That small dot

它平常只是一个安静的圆点，显示今天的累计时间。
点一下，它展开成一张卡片，告诉你今天、这周、这个月的分量。
再点一下，它收起，继续安静。

*Most of the time it is just a quiet dot showing today's total.*
*Tap it, and it unfolds into a card: today, this week, this month.*
*Tap it again and it folds away, quiet again.*

---

## 关于数据，诚实说明 · About your data, honestly

| 中文 | English |
|---|---|
| **全部数据都存在你自己的浏览器里**，不经过任何服务器。 | **Everything stays in your own browser.** No server ever sees it. |
| **没有账号**，不需要注册，不需要登录。 | **No account.** No sign-up, no login. |
| **不上传**，一行数据都不会离开你的设备。 | **No upload.** Not a single line leaves your device. |
| **不追踪**，没有埋点，没有统计，没有第三方脚本。 | **No tracking.** No beacons, no analytics, no third-party scripts. |
| **只读 GitHub**，权限仅限 `github.com`，看不见别的网站。 | **GitHub only.** Permission is limited to `github.com`; it cannot see other sites. |
| **自动遗忘**，超过 90 天的记录会被悄悄抹去。 | **It forgets.** Records older than 90 days fade away quietly. |

只有一个细节需要坦白：
有时间的时候，它是精确的。没有时间的时候，它是估算的。

*One honest detail:*
*when the page tells it the time, it is exact. When it can't, it is an estimate.*

---

## 它不做什么 · What it does not do

| 中文 | English |
|---|---|
| 它不给你打分。 | It does not score you. |
| 它不做排行榜，也不和别人比较。 | It has no leaderboard and compares you with no one. |
| 它不提醒你「该努力了」。 | It never tells you to try harder. |
| 它不替你决定什么算「有价值的时间」。 | It does not decide what counts as worthy time. |
| 它不联网，也不打电话回家。 | It does not connect out. It never phones home. |

---

## 一点技术 · A little technical note

* **Manifest V3**，原生 JavaScript，零依赖，整包不到 150 KB。
* 权限克制到极处：`storage`、`tabs`、`alarms`，仅此三项。
* 时间按类别切分：写代码 / 拉取请求 / 议题 / 搜索 / 其它。
* 空闲两分钟即停表，单次会话上限三十分钟，每分钟校准一次。
* 页面切到后台、或六十秒无操作，就不再计数。

* **Manifest V3**, vanilla JavaScript, zero dependencies, under 150 KB in total.*
* *Permissions kept to the bone: `storage`, `tabs`, `alarms` — nothing more.*
* *Time is split by category: code / pull requests / issues / search / other.*
* *Idle after two minutes, a single session caps at thirty, calibrated once a minute.*
* *When the tab goes to the background, or sixty seconds pass without input, counting stops.*

---

## 为什么做它 · Why it exists

因为时间是我们最诚实的东西，
却也是我们最不擅长记账的东西。

*Because time is the most honest thing we have,*
*and the thing we are worst at keeping books on.*

---

## 许可 · License

MIT

---

<p align="center">
  <i>替你把日子数清楚。</i><br>
  <i>Counting your days, quietly.</i>
</p>
