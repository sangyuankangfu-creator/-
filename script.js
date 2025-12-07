document.addEventListener('DOMContentLoaded', () => {
    // Service Worker Registration
    if ('serviceWorker' in navigator) {
        navigator.serviceWorker.register('service-worker.js')
            .then(registration => {
                console.log('ServiceWorker registration successful with scope: ', registration.scope);
            })
            .catch(err => {
                console.log('ServiceWorker registration failed: ', err);
            });
    }

    // DOM Elements
    const resultText = document.getElementById('result-text');
    const toggleBtn = document.getElementById('toggle-btn');
    const micIcon = document.getElementById('mic-icon');
    const btnText = document.getElementById('btn-text');
    const statusIndicator = document.getElementById('status-indicator');
    const statusText = document.getElementById('status-text');
    const copyBtn = document.getElementById('copy-btn');
    const pasteBtn = document.getElementById('paste-btn');
    const clearBtn = document.getElementById('clear-btn');

    // Speech Recognition Setup
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;

    if (!SpeechRecognition) {
        alert('お使いのブラウザは音声認識をサポートしていません。Google Chromeなどの最新ブラウザをご利用ください。');
        toggleBtn.disabled = true;
        btnText.textContent = '非対応ブラウザ';
        return;
    }

    const recognition = new SpeechRecognition();
    recognition.lang = 'ja-JP';
    recognition.interimResults = true;
    recognition.continuous = true;

    let isRecording = false;
    let finalTranscript = '';

    // Functions
    const startRecording = () => {
        try {
            recognition.start();
            isRecording = true;
            updateUIState(true);
        } catch (error) {
            console.error('Error starting recognition:', error);
        }
    };

    const stopRecording = () => {
        recognition.stop();
        isRecording = false;
        updateUIState(false);
    };

    const setCursorToEnd = (element) => {
        element.focus();
        const range = document.createRange();
        range.selectNodeContents(element);
        range.collapse(false);
        const selection = window.getSelection();
        selection.removeAllRanges();
        selection.addRange(range);
    };

    const updateUIState = (recording) => {
        if (recording) {
            toggleBtn.classList.add('recording');
            statusIndicator.classList.add('recording');
            micIcon.textContent = 'mic_off';
            btnText.textContent = '録音停止';
            statusText.textContent = '録音中...';
        } else {
            toggleBtn.classList.remove('recording');
            statusIndicator.classList.remove('recording');
            micIcon.textContent = 'mic';
            btnText.textContent = '録音開始';
            statusText.textContent = '待機中';
            // 録音停止時にカーソルを末尾に移動
            setCursorToEnd(resultText);
        }
    };

    // Event Listeners
    toggleBtn.addEventListener('click', () => {
        if (isRecording) {
            stopRecording();
        } else {
            startRecording();
        }
    });

    recognition.onresult = (event) => {
        let interimTranscript = '';

        for (let i = event.resultIndex; i < event.results.length; ++i) {
            if (event.results[i].isFinal) {
                finalTranscript += event.results[i][0].transcript + '\n';
            } else {
                interimTranscript += event.results[i][0].transcript;
            }
        }

        // 既存のテキストを保持しつつ、新しい結果を追加
        // contenteditable div の中身を更新
        // 注意: ユーザーが手動で編集した場合の整合性を保つため、
        // 単純な代入ではなく、追記ロジックを工夫する必要があるが、
        // ここではシンプルに認識結果を表示する形にする。
        // ユーザーの手動編集を尊重するため、finalTranscriptは内部状態として持つが、
        // 表示は現在のinnerText + 新しい認識結果とするのが理想的だが複雑になる。
        // 今回はシンプルに「認識結果を追記していく」スタイルにする。

        // ユーザーが編集した内容が消えないように、resultTextの現在の内容をベースにするのは難しい
        // (認識中は頻繁に更新されるため)。
        // 解決策: 認識結果は常に末尾に追加される形にする。

        // 今回の実装:
        // interimResultsが表示されている間は、確定したテキスト + 未確定テキストを表示。
        // 確定したら finalTranscript に追加。

        // しかし、ユーザーが途中を編集したい場合もある。
        // ここではシンプルに「認識されたテキストを表示エリアに流し込む」実装にする。
        // 編集機能とリアルタイム更新の両立は複雑なので、
        // 認識中は自動スクロールさせつつ表示する。

        resultText.innerText = finalTranscript + interimTranscript;

        // Auto scroll to bottom
        resultText.scrollTop = resultText.scrollHeight;
    };

    recognition.onend = () => {
        if (isRecording) {
            // 意図せず終了した場合（無音など）、再開する
            // ただし、ユーザーが明示的に止めた場合は再開しない
            // ここではシンプルにするため、自動再開はせず状態を戻す
            // もし continuous: true でも止まることがあるなら再開ロジックが必要
            // Chromeの仕様で止まることがあるため、isRecordingフラグを見て再開させるのが一般的
            try {
                recognition.start();
            } catch (e) {
                isRecording = false;
                updateUIState(false);
            }
        } else {
            updateUIState(false);
        }
    };

    recognition.onerror = (event) => {
        console.error('Speech recognition error', event.error);
        if (event.error === 'not-allowed') {
            alert('マイクの使用が許可されていません。ブラウザの設定を確認してください。');
            isRecording = false;
            updateUIState(false);
        }
    };

    // Copy Button
    copyBtn.addEventListener('click', () => {
        const text = resultText.innerText;
        if (!text) return;

        navigator.clipboard.writeText(text).then(() => {
            // Show feedback
            const originalIcon = copyBtn.innerHTML;
            copyBtn.innerHTML = '<span class="material-icons-round">check</span>';
            setTimeout(() => {
                copyBtn.innerHTML = originalIcon;
            }, 2000);
        }).catch(err => {
            console.error('Failed to copy text: ', err);
        });
    });

    // Paste Button
    pasteBtn.addEventListener('click', async () => {
        try {
            const text = await navigator.clipboard.readText();
            if (text) {
                // 現在のカーソル位置に挿入するのが理想だが、
                // contenteditableの場合は複雑になるため、
                // シンプルに末尾に追加、あるいは空ならそのまま設定する
                // ここではユーザーの利便性を考え、既存テキストがあれば改行して追記、なければそのまま設定

                // フォーカスを合わせる
                resultText.focus();

                // execCommandを使用するとカーソル位置に挿入できる（非推奨だが多くのブラウザで動作）
                // あるいはSelection APIを使う

                const selection = window.getSelection();
                if (selection.rangeCount > 0) {
                    const range = selection.getRangeAt(0);
                    // resultText内にあるか確認
                    if (resultText.contains(range.commonAncestorContainer)) {
                        range.deleteContents();
                        const textNode = document.createTextNode(text);
                        range.insertNode(textNode);
                        // カーソルを挿入したテキストの後ろに移動
                        range.setStartAfter(textNode);
                        range.setEndAfter(textNode);
                        selection.removeAllRanges();
                        selection.addRange(range);
                    } else {
                        // フォーカスがない場合は末尾に追加
                        resultText.innerText += (resultText.innerText ? '\n' : '') + text;
                    }
                } else {
                    resultText.innerText += (resultText.innerText ? '\n' : '') + text;
                }

                // 内部状態も更新
                finalTranscript = resultText.innerText;

                // Show feedback
                const originalIcon = pasteBtn.innerHTML;
                pasteBtn.innerHTML = '<span class="material-icons-round">check</span>';
                setTimeout(() => {
                    pasteBtn.innerHTML = originalIcon;
                }, 2000);
            }
        } catch (err) {
            console.error('Failed to read clipboard: ', err);
            alert('クリップボードの読み取りに失敗しました。ブラウザの許可設定を確認してください。');
        }
    });

    // Clear Button
    clearBtn.addEventListener('click', () => {
        if (confirm('テキストをすべて消去しますか？')) {
            finalTranscript = '';
            resultText.innerText = '';
            resultText.focus();
        }
    });

    // 手動編集への対応:
    // ユーザーがテキストエリアを編集した場合、finalTranscriptも更新しないと
    // 次の認識結果で上書きされてしまう可能性がある。
    resultText.addEventListener('input', () => {
        finalTranscript = resultText.innerText;
        // 末尾に改行がない場合、次の認識のために改行を追加しておくと良いかも
        if (finalTranscript && !finalTranscript.endsWith('\n')) {
            finalTranscript += '\n';
        }
    });
});
