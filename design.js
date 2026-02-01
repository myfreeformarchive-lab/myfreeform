// design.js
import { DOM } from './app.js';

const handleCommentSubmission = async () => {
    const commentText = DOM.commentInput.value.trim();
    if (!commentText) return;

    // --- KEYBOARD SUPPRESSION FORCE ---
    // 1. Set focus to the button or just blur the input
    DOM.commentInput.blur();
    
    // 2. The "Hard Kill": Temporarily disable the input
    // This tells the OS (especially iOS) the field is no longer interactable
    DOM.commentInput.disabled = true;

    if ('virtualKeyboard' in navigator) {
        navigator.virtualKeyboard.hide();
    }

    // --- UI LOADING STATE ---
    DOM.sendComment.disabled = true;
    const originalBtnText = DOM.sendComment.innerText;
    DOM.sendComment.innerText = '...';

    try {
        // --- YOUR FIREBASE/POST LOGIC HERE ---
        // await postComment(commentText);

        // Clear the field
        DOM.commentInput.value = '';
        
        // Mobile UX: Scroll new content into view
        DOM.commentList.lastElementChild?.scrollIntoView({ behavior: 'smooth' });

    } catch (error) {
        console.error("Submission failed:", error);
    } finally {
        // 3. Re-enable the input after a tiny delay so the keyboard stays down
        setTimeout(() => {
            DOM.commentInput.disabled = false;
            DOM.sendComment.disabled = false;
            DOM.sendComment.innerText = originalBtnText;
        }, 100);
    }
};

// Event Listeners
DOM.sendComment.addEventListener('click', (e) => {
    e.preventDefault(); // Prevent any default behavior that might keep focus
    handleCommentSubmission();
});

DOM.commentInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        handleCommentSubmission();
    }
});
