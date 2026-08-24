---
step: "<N>"
title: "<步驟名稱>"
next: "<通過後下一步的 step id，如 2a、2b、3>"
---

# Step <N>: <步驟名稱>

**預估**: input ~X-Y K / output ~X-Y K
**model**: `PI_MODEL_*` / **thinking**: <level>

## 任務內容

1. 步驟 1
2. 步驟 2
3. ...

## 遠端指令注意

如果需要在遠端主機執行指令，使用 `ssh <host> <command>` 前綴方式：
```bash
ssh ${RDNA_DEV_HOST%:*} ls /path/to/sglang
ssh ${RDNA_DEV_HOST%:*} python3 -c "import torch; print(torch.cuda.is_available())"
```

## 完成條件

- [ ] 任務事項 1 已完成
- [ ] 任務事項 2 已完成
- [ ] `notes/execution-log.md` 已更新
- [ ] 執行 `./chk --step <N> --result <CODE>` 通過後，請看 `chk` 的輸出訊息確認下一步