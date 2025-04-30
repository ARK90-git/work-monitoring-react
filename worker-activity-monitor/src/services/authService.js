// authService.js

/**
 * Simple authentication service that uses localStorage as a storage mechanism
 */
const authService = {
    /**
     * Initialize the users storage if it doesn't exist
     */
    initStorage: () => {
      if (!localStorage.getItem('users')) {
        localStorage.setItem('users', JSON.stringify([]));
      }
    },
  
    /**
     * Register a new user
     * @param {Object} userData - User data including name, email, and password
     * @returns {Object} - Created user or error
     */
    register: (userData) => {
      // Initialize storage if needed
      authService.initStorage();
      
      // Get current users
      const users = JSON.parse(localStorage.getItem('users') || '[]');
      
      // Check if email already exists
      if (users.some(user => user.email === userData.email)) {
        return { error: 'Email already in use' };
      }
      
      // Create new user (without storing the password in plain text in a real app)
      const newUser = {
        id: Date.now().toString(),
        name: userData.name,
        email: userData.email,
        password: userData.password, // In a real app, this should be hashed
        createdAt: new Date().toISOString()
      };
      
      // Save to localStorage
      users.push(newUser);
      localStorage.setItem('users', JSON.stringify(users));
      
      // Return user without password
      const { password, ...userWithoutPassword } = newUser;
      return { user: userWithoutPassword };
    },
  
    /**
     * Log in an existing user
     * @param {string} email - User email
     * @param {string} password - User password
     * @returns {Object} - Logged in user or error
     */
    login: (email, password) => {
      // Initialize storage if needed
      authService.initStorage();
      
      // Get current users
      const users = JSON.parse(localStorage.getItem('users') || '[]');
      
      // Find user by email and password
      const user = users.find(u => u.email === email && u.password === password);
      
      if (!user) {
        return { error: 'Invalid email or password' };
      }
      
      // Store current user in session
      const { password: pass, ...userWithoutPassword } = user;
      localStorage.setItem('currentUser', JSON.stringify(userWithoutPassword));
      
      return { user: userWithoutPassword };
    },
  
    /**
     * Log out the current user
     */
    logout: () => {
      localStorage.removeItem('currentUser');
      return { success: true };
    },
  
    /**
     * Get the current logged in user
     * @returns {Object|null} - Current user or null if not logged in
     */
    getCurrentUser: () => {
      const userJson = localStorage.getItem('currentUser');
      return userJson ? JSON.parse(userJson) : null;
    },
  
    /**
     * Check if a user is logged in
     * @returns {boolean} - Whether a user is logged in
     */
    isAuthenticated: () => {
      return !!localStorage.getItem('currentUser');
    }
  };
  
  export default authService;