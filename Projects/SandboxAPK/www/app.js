document.addEventListener('DOMContentLoaded', () => {
    const editorView = document.getElementById('editor-view');
    const previewView = document.getElementById('preview-view');
    const settingsView = document.getElementById('settings-view');
    const headerTitle = document.getElementById('header-title');

    const editor = document.getElementById('editor');
    const preview = document.getElementById('preview');

    const editorBtn = document.getElementById('editor-btn');
    const previewBtn = document.getElementById('preview-btn');
    const settingsBtn = document.getElementById('settings-btn');
    const downloadBtn = document.getElementById('download-btn');

    const views = {
        'editor-view': { btn: editorBtn, title: 'HTML Code Editor' },
        'preview-view': { btn: previewBtn, title: 'Preview' },
        'settings-view': { btn: settingsBtn, title: 'Settings' },
    };

    const defaultHtml = `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>My Page</title>
    <style>
        /* Your CSS goes here */
        body {
            font-family: sans-serif;
            color: #333;
        }
    </style>
</head>
<body>
    <h1>Hello, World!</h1>
    <p>This is a sample page.</p>

    <script>
        // Your JavaScript goes here
        console.log('Page loaded!');
    <\/script>
</body>
</html>`;

    editor.value = defaultHtml;

    function showView(viewId) {
        // Hide all views
        Object.keys(views).forEach(id => {
            document.getElementById(id).classList.remove('active');
            const pTag = views[id].btn.querySelector('p');
            const divIcon = views[id].btn.querySelector('div');
            if (pTag) pTag.classList.add('text-[#9dabb9]');
            if (divIcon) divIcon.classList.add('text-[#9dabb9]');
            if (pTag) pTag.classList.remove('text-white');
            if (divIcon) divIcon.classList.remove('text-white');
        });

        // Show the selected view
        const viewToShow = document.getElementById(viewId);
        if (viewToShow) {
            viewToShow.classList.add('active');
            headerTitle.textContent = views[viewId].title;
            const pTag = views[viewId].btn.querySelector('p');
            const divIcon = views[viewId].btn.querySelector('div');

            if (pTag) pTag.classList.remove('text-[#9dabb9]');
            if (divIcon) divIcon.classList.remove('text-[#9dabb9]');
            if (pTag) pTag.classList.add('text-white');
            if (divIcon) divIcon.classList.add('text-white');
        }
    }

    editorBtn.addEventListener('click', (e) => {
        e.preventDefault();
        showView('editor-view');
    });

    previewBtn.addEventListener('click', (e) => {
        e.preventDefault();
        const content = editor.value;
        const previewDoc = preview.contentWindow.document;
        previewDoc.open();
        previewDoc.write(content);
        previewDoc.close();
        showView('preview-view');
    });

    settingsBtn.addEventListener('click', (e) => {
        e.preventDefault();
        showView('settings-view');
    });

    downloadBtn.addEventListener('click', () => {
        const blob = new Blob([editor.value], { type: 'text/html' });
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = 'index.html';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(a.href);
    });

    // Set initial view
    showView('editor-view');
});