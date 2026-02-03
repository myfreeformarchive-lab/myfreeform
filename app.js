// Updating the createPostNode function to fix the double-tap logic and restore the badge structure.

function createPostNode(post) {
    // Fix double-tap logic here
    let lastTap = 0;
    const doubleTapDelay = 300;

    function handleTap(event) {
        const currentTime = new Date().getTime();
        if (currentTime - lastTap < doubleTapDelay) {
            // Handle double tap action
            console.log('Double tap detected!');
        }
        lastTap = currentTime;
    }

    // Restore Global/Local badge structure
    const badgeContainer = document.createElement('div');
    badgeContainer.className = 'badge-container';

    // Create Global badge
    const globalBadge = document.createElement('span');
    globalBadge.className = 'badge global';
    globalBadge.innerText = 'Global';

    // Create Local badge
    const localBadge = document.createElement('span');
    localBadge.className = 'badge local';
    localBadge.innerText = 'Local';

    // Append badges to the container
    badgeContainer.appendChild(globalBadge);
    badgeContainer.appendChild(localBadge);

    // Append badge container to the post
    post.appendChild(badgeContainer);

    // Add event listener for taps
    post.addEventListener('click', handleTap);
}