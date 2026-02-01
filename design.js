/**
 * Logic to dismiss the mobile keyboard and handle submission
 */
const handleCommentSubmission = async () => {
    const commentText = DOM.commentInput.value.trim();
    if (!commentText) return;

    // 1. IMMEDIATELY trigger the blur to signal to the OS to hide the keyboard
    DOM.commentInput.blur();

    // 2. Modern 2026 Standard: Virtual Keyboard API
    // This explicitly tells the browser to hide the OS keyboard overlay
    if ('virtualKeyboard' in navigator) {
        navigator.virtualKeyboard.hide();
    }

    // 3. Visual Feedback: Disable button to prevent double-taps
    DOM.sendComment.disabled = true;
    DOM.sendComment.innerText = '...';

    try {
        // --- YOUR FIREBASE/POST LOGIC HERE ---
        // await postComment(currentPostId, commentText);

        // Clear the field
        DOM.commentInput.value = '';
        
        // 4. Scroll to bottom of comments to show the new content
        DOM.commentList.lastElementChild?.scrollIntoView({ behavior: 'smooth' });

    } catch (error) {
        console.error("Submission failed:", error);
    } finally {
        DOM.sendComment.disabled = false;
        DOM.sendComment.innerText = 'Post';
    }
};

// Event Listeners
DOM.sendComment.addEventListener('click', handleCommentSubmission);

// Also handle the "Enter" key (send hint)
DOM.commentInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        handleCommentSubmission();
    }
});