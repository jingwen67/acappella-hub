.pragma library

// Keep creation in the same JS turn: the closed host is deleted after return.
// Refuse to switch projects unless its window has actually become invisible.
function run(window, closeAssistant, createScore, info, log, showScore) {
    if (!window || !window.visible)
        throw new Error('无法确认助手窗口状态，已取消建谱。');
    log('closing assistant');
    closeAssistant();
    if (window.visible)
        throw new Error('助手窗口尚未关闭，已取消建谱。');
    log('assistant closed; creating score');
    if (!createScore(info))
        throw new Error('MuseScore 未能从模板创建新谱，请重新打开助手重试。');
    log('score created');
    if (showScore) {
        log('opening score page');
        if (!showScore())throw new Error('新谱已创建，但未能切换乐谱页面。请点击顶部 Score／乐谱。');
        log('score page requested');
    }
}

