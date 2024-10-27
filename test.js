// scripts.js

// Initialize Firebase services
const auth = firebase.auth();
const db = firebase.firestore();

// Global Variables
let currentUser = null;
let currentUserRole = '';
let allowedClasses = [];
let canEdit = false;
let isSuperAdmin = false;
let attendanceData = [];
let allPersons = [];
let currentClass = '';
let editRecordId = null;
let currentMonth = new Date().getMonth();
let currentYear = new Date().getFullYear();
// Initialize Choices.js instances
let filterNameChoices;
let bulkRecordNamesChoices;
let recordNameChoices;
let viewPersonChoices;
let attendanceUnsubscribers = [];

//View and edit person
// Choices.js Instances
let filterTagsChoices;
let addPersonTagsChoices;
let viewPersonTagsChoices;
let editPersonTagsChoices;
let currentEditingPersonId = null;
let isLoadingTags = false;

// Cache Objects
let classPersonsCache = {};
let attendanceCache = {};
// DOM Elements
const signInModal = document.getElementById('signInModal');
const signUpModal = document.getElementById('signUpModal');
const mainContent = document.getElementById('mainContent');
const navbarMenu = document.getElementById('navbarMenu');
const hamburgerMenu = document.getElementById('hamburgerMenu');
const classSelect = document.getElementById('classSelect');
const nameSearchInput = document.getElementById('nameSearch');
const attendanceTableBody = document.getElementById('attendanceTable');
const calendarView = document.getElementById('calendarView');
const tableView = document.getElementById('tableView');
const calendar = document.getElementById('calendar');
const currentMonthYear = document.getElementById('currentMonthYear');
const prevMonthButton = document.getElementById('prevMonthButton');
const nextMonthButton = document.getElementById('nextMonthButton');
const addUserButton = document.getElementById('addUserButton');
const logoutButton = document.getElementById('logoutButton');
const personTableBody = document.getElementById('personTable'); // For person management page

// Toast Notification Element
const toast = document.createElement('div');
toast.id = 'toast';
toast.className = 'hidden';
document.body.appendChild(toast);

// Authentication State Listener
auth.onAuthStateChanged(user => {
    if (user) {
        currentUser = user;
        initializeApp();
        hideSignInModal();
    } else {
        currentUser = null;
        resetApp();
        showSignInModal();
    }
});

// Show Sign-In Modal
function showSignInModal() {
    if (signInModal) {
        signInModal.classList.add('show');
        signInModal.classList.remove('hidden');
    }
    if (mainContent) {
        mainContent.classList.add('hidden');
    }
}

// Hide Sign-In Modal
function hideSignInModal() {
    if (signInModal) {
        signInModal.classList.remove('show');
        signInModal.classList.add('hidden');
    }
    if (mainContent) {
        mainContent.classList.remove('hidden');
    }
}

// Reset App
function resetApp() {
    currentUserRole = '';
    allowedClasses = [];
    canEdit = false;
    isSuperAdmin = false;
    attendanceData = [];
    allPersons = [];
    currentClass = '';
    editRecordId = null;
    currentMonth = new Date().getMonth();
    currentYear = new Date().getFullYear();
    if (mainContent) {
        mainContent.classList.add('hidden');
    }

    // Clear Choices.js instances
    destroyChoicesInstances();

    // Hide all modals
    closeAllForms();

    // Clear attendance table and calendar
    if (attendanceTableBody) {
        attendanceTableBody.innerHTML = '';
    }
    if (calendar) {
        calendar.innerHTML = '';
    }
    if (personTableBody) {
        personTableBody.innerHTML = '';
    }
}

// Destroy all Choices.js instances
function destroyChoicesInstances() {
    if (filterNameChoices) {
        filterNameChoices.destroy();
        filterNameChoices = null;
    }
    if (bulkRecordNamesChoices) {
        bulkRecordNamesChoices.destroy();
        bulkRecordNamesChoices = null;
    }
    if (recordNameChoices) {
        recordNameChoices.destroy();
        recordNameChoices = null;
    }
    if (viewPersonChoices) {
        viewPersonChoices.destroy();
        viewPersonChoices = null;
    }
}

// Handle Sign-In
if (document.getElementById('signInForm')) {
    document.getElementById('signInForm').addEventListener('submit', handleSignIn);
}

function handleSignIn(event) {
    event.preventDefault();
    const email = document.getElementById('signInEmail').value.trim();
    const password = document.getElementById('signInPassword').value;

    auth.signInWithEmailAndPassword(email, password)
        .then(userCredential => {
            currentUser = userCredential.user;
            initializeApp();
            hideSignInModal();
        })
        .catch(error => {
            showToast(error.message);
        });
}
// Load Persons for a Given Class and Choices.js Instance (with caching)
// Load Persons for a Given Class and Initialize Choices.js
function loadPersonsForForm(className, choicesInstance) {
    return db.collection('classes').doc(className).collection('persons').get()
        .then(querySnapshot => {
            const personOptions = [];
            querySnapshot.forEach(doc => {
                const data = doc.data();
                personOptions.push({
                    value: doc.id,
                    label: data.name
                });
            });

            if (choicesInstance) {
                choicesInstance.clearStore();
                choicesInstance.setChoices(personOptions, 'value', 'label', true);
            }

            return;
        })
        .catch(error => {
            showToast('Error loading persons: ' + error.message);
        });
}



// Handle Sign-Up (SuperAdmin only)
if (document.getElementById('signUpForm')) {
    document.getElementById('signUpForm').addEventListener('submit', handleSignUp);
}

function handleSignUp(event) {
    event.preventDefault();
    const email = document.getElementById('signUpEmail').value.trim();
    const password = document.getElementById('signUpPassword').value;
    const role = document.getElementById('signUpRole').value;

    // Only SuperAdmin can create new users
    if (!isSuperAdmin) {
        showToast('You do not have permission to create users.');
        return;
    }

    auth.createUserWithEmailAndPassword(email, password)
        .then(userCredential => {
            // Save user role in Firestore
            return db.collection('users').doc(email).set({
                role: role
            });
        })
        .then(() => {
            showToast('User created successfully.');
            closeForm('signUpModal');
            document.getElementById('signUpForm').reset();
        })
        .catch(error => {
            showToast(error.message);
        });
}

// Logout User
if (logoutButton) {
    logoutButton.addEventListener('click', logout);
}

function logout() {
    auth.signOut().then(() => {
        currentUser = null;
        // resetApp();
        showSignInModal();
    }).catch(error => {
        showToast('Error during logout: ' + error.message);
    });
}

// Initialize App after Authentication
function initializeApp() {
    getUserRole().then(role => {
        currentUserRole = role;
        return setupPermissions(role);
    }).then(() => {
        populateAllClassSelects(); // Add this line
        setupUIForRole();

        // Only initialize Choices and load data if not on index page
        if (currentPage !== 'index') {
            initializeChoices();
            loadAllPersons().then(() => {
                // Depending on the page, load attendance or person data
                if (currentPage === 'attendance') {
                    toggleView('calendar');
                    loadAttendance();
                } else if (currentPage === 'person_management') {
                    loadPersons();
                }
            });
        }

        setupEventListeners();

        // Load Tags for filter
        if (currentPage === 'person_management') {
            loadFilterTags();
            loadTags();
        }

        // If on index.html (landing page), set up role options
        if (currentPage === 'index') {
            setupRoleOptions();
        }
    }).catch(error => {
        showToast('Error initializing app: ' + error.message);
    });
}



// Get User Role from Firestore
function getUserRole() {
    return db.collection('users').doc(currentUser.email).get().then(doc => {
        if (doc.exists) {
            return doc.data().role;
        } else {
            // Default role if not set
            if (currentUser.email == "bara3emBoyseditor@pst.com"){
                role = "bara3emBoys Editor";
            } else if (currentUser.email == "bara3emBoysviewer@pst.com"){
                role = "bara3emBoys Viewer";
            } else if (currentUser.email == "bara3emGirlsviewer@pst.com"){
                role = "bara3emGirls Viewer";
            } else if (currentUser.email == "bara3emGirlseditor@pst.com"){
                role = "bara3emGirls Editor";
            }else{
                role = "no role";
                showToast('Error With the Roles: Please contact the Admin');
            }
                return role;
        }
    });
}

// Setup Permissions based on Role
function setupPermissions(role) {
    allowedClasses = [];
    canEdit = false;
    isSuperAdmin = false;

    let classesPromise;

    if (role === 'SuperAdmin' || role === 'Full Editor' || role === 'Full Viewer') {
        if (role === 'SuperAdmin') {
            isSuperAdmin = true;
            canEdit = true;
        } else if (role === 'Full Editor') {
            canEdit = true;
        }

        // Fetch all classes dynamically
        classesPromise = db.collection('classes').get().then(snapshot => {
            snapshot.forEach(doc => {
                allowedClasses.push(doc.id);
            });
        });
    } else {
        // Class-specific roles
        const classMatch = role.match(/^([a-zA-Z0-9]+) (Viewer|Editor)$/);
        if (classMatch) {
            const className = classMatch[1];
            const roleType = classMatch[2];
            allowedClasses.push(className);
            canEdit = (roleType === 'Editor');
            classesPromise = Promise.resolve();
        } else {
            showToast('Unknown role. Logging out.');
            logout();
            return Promise.reject('Unknown role');
        }
    }

    return classesPromise.then(() => {
        populateAllClassSelects();
        if (classSelect) {
            currentClass = 'جميع القطاعات';
            classSelect.value = currentClass;
        }
    }).catch(error => {
        showToast('Error fetching classes: ' + error.message);
    });
}



// Setup UI Elements based on Role
function setupUIForRole() {
    if (currentPage === 'index') {
        // Nothing to do here, setupRoleOptions will handle UI
    } else {
        // Show or hide Create User button
        if (addUserButton) {
            if (isSuperAdmin && currentPage === 'user_management') {
                addUserButton.style.display = 'inline-block';
            } else {
                addUserButton.style.display = 'none';
            }
        }

        // Show or hide editing controls
        if (!canEdit) {
            if (currentPage === 'attendance') {
                document.querySelectorAll('.control-button[data-action="addRecordForm"], .control-button[data-action="bulkAttendanceForm"]').forEach(button => {
                    button.style.display = 'none';
                });
            } 
        } else {
            if (currentPage === 'attendance') {
                document.querySelectorAll('.control-button[data-action="addRecordForm"], .control-button[data-action="bulkAttendanceForm"]').forEach(button => {
                    button.style.display = 'inline-block';
                });
            } 
        }

        // Set initial class
        if (allowedClasses.length > 0) {
            currentClass = allowedClasses[0];
            if (classSelect) {
                classSelect.value = currentClass;
            }
            if (currentPage === 'attendance') {
                loadPersons();
                loadAttendance();
            } else if (currentPage === 'person_management') {
                loadPersons();
            }
        } else {
            // showToast('No classes available.');
        }
    }
}

// Initialize Choices.js
function initializeChoices() {
    // Initialize Choices.js instances based on currentPage
    if (currentPage === 'attendance') {
        // Initialize Choices.js for Filter Names if not already initialized
        if (!filterNameChoices) {
            filterNameChoices = new Choices('#filterName', {
                removeItemButton: true,
                searchResultLimit: 5,
                position: 'bottom',
                shouldSort: false,
                itemSelectText: '',
                searchFields: ['label', 'value'],
                fuseOptions: {
                    include: 'score',
                    threshold: 0.3 // Adjust threshold as needed
                }
            });
        }

        // Initialize Choices.js for Bulk Record Names if not already initialized
        if (!bulkRecordNamesChoices) {
            bulkRecordNamesChoices = new Choices('#bulkRecordNames', {
                removeItemButton: true,
                searchResultLimit: 5,
                position: 'bottom',
                shouldSort: false,
                itemSelectText: ''
            });
        }

        // Initialize Choices.js for Record Names if not already initialized
        if (!recordNameChoices) {
            recordNameChoices = new Choices('#recordName', {
                removeItemButton: true,
                maxItemCount: 1,
                searchResultLimit: 5,
                position: 'bottom',
                shouldSort: false,
                itemSelectText: '',
                searchEnabled: true,
                searchFields: ['label', 'value'],
                fuseOptions: {
                    include: 'score',
                    threshold: 0.3 // Adjust threshold as needed
                }
            });
        }
    } else if (currentPage === 'person_management') {
        // Initialize Choices.js for tag selects
        const editPersonTagsElement = document.getElementById('editPersonTags');
        if (editPersonTagsElement && !editPersonTagsChoices) {
            editPersonTagsChoices = new Choices(editPersonTagsElement, {
                removeItemButton: true,
                shouldSort: false,
                searchResultLimit: 5,
                searchPlaceholderValue: 'Search tags',
                noResultsText: 'No tags found',
                placeholderValue: 'Select tags',
            });
        }

        const viewPersonTagsElement = document.getElementById('viewPersonTags');
        if (viewPersonTagsElement && !viewPersonTagsChoices) {
            viewPersonTagsChoices = new Choices(viewPersonTagsElement, {
                removeItemButton: true,
                shouldSort: false,
                searchResultLimit: 5,
                searchPlaceholderValue: 'Search tags',
                noResultsText: 'No tags found',
                placeholderValue: 'Select tags',
            });
        }

        // Initialize Choices.js for filterTags if applicable
        const filterTagsElement = document.getElementById('filterTags');
        if (filterTagsElement && !filterTagsChoices) {
            filterTagsChoices = new Choices(filterTagsElement, {
                removeItemButton: true,
                shouldSort: false,
                searchResultLimit: 5,
                searchPlaceholderValue: 'Search tags',
                noResultsText: 'No tags found',
                placeholderValue: 'Select tags',
            });
        }

        // Initialize Choices.js for addPersonTags if applicable
        const addPersonTagsElement = document.getElementById('addPersonTags');
        if (addPersonTagsElement && !addPersonTagsChoices) {
            addPersonTagsChoices = new Choices(addPersonTagsElement, {
                removeItemButton: true,
                shouldSort: false,
                searchResultLimit: 5,
                searchPlaceholderValue: 'Search tags',
                noResultsText: 'No tags found',
                placeholderValue: 'Select tags',
            });
        }


    }




}


// Close all open forms
function closeAllForms() {
    const modals = document.querySelectorAll('.modal');
    modals.forEach(modal => {
        modal.classList.add('hidden');
        modal.classList.remove('show');
    });
}
// Toggle View between Calendar and Table
function toggleView(view) {
    if (view === 'calendar') {
        calendarView.classList.remove('hidden');
        tableView.classList.add('hidden');
        generateCalendarView();
    } else if (view === 'table') {
        calendarView.classList.add('hidden');
        tableView.classList.remove('hidden');
        populateAttendanceTable();
    }
}

// Apply Filters
function applyFilters(closeDropdown = false) {
    let filteredData = [...attendanceData];

    // Filter by Name Search
    const nameSearchValue = nameSearchInput.value.toLowerCase();
    if (nameSearchValue) {
        filteredData = filteredData.filter(entry =>
            entry.name.toLowerCase().includes(nameSearchValue)
        );
    }

    // Filter by Selected Names
    const selectedNames = filterNameChoices.getValue(true);
    if (selectedNames.length > 0) {
        filteredData = filteredData.filter(entry =>
            selectedNames.includes(entry.personId)
        );
    }

    // Filter by Date
    const filterDate = document.getElementById('filterDate').value;
    if (filterDate) {
        filteredData = filteredData.filter(entry => entry.date === filterDate);
    }

    // Update Views
    populateAttendanceTable(filteredData);
    generateCalendarView(filteredData);

    // Close the filter modal only when appropriate
    if (closeDropdown) {
        toggleFilterDropdown();
    }
}


// Populate Attendance Table
function populateAttendanceTable(data = attendanceData) {
    attendanceTableBody.innerHTML = '';
    if (data.length === 0) {
        const row = document.createElement('tr');
        row.innerHTML = `<td colspan="6" style="text-align:center;">No records found.</td>`;
        attendanceTableBody.appendChild(row);
        return;
    }

    if (currentClass === 'جميع القطاعات') {
        // Group data by date and class
        const groupedData = {};
        data.forEach(entry => {
            if (!groupedData[entry.date]) {
                groupedData[entry.date] = {};
            }
            if (!groupedData[entry.date][entry.class]) {
                groupedData[entry.date][entry.class] = [];
            }
            groupedData[entry.date][entry.class].push(entry);
        });

        for (const date in groupedData) {
            for (const cls in groupedData[date]) {
                // Add a heading for each class
                const classRow = document.createElement('tr');
                classRow.innerHTML = `<td colspan="6" style="background-color: #f0f0f0;"><strong>${date} - ${cls}</strong></td>`;
                attendanceTableBody.appendChild(classRow);

                groupedData[date][cls].forEach(entry => {
                    const row = document.createElement('tr');
                    row.innerHTML = `
                        <td>${entry.class}</td>
                        <td>${entry.name}</td>
                        <td>${entry.date}</td>
                        <td>${entry.attendance}</td>
                        <td>${entry.description}</td>
                        <td>
                            ${canEdit ? `<button class="edit-button" onclick="openEditRecordForm('${entry.id}', '${entry.class}')">Edit</button>` : ''}
                        </td>
                    `;
                    attendanceTableBody.appendChild(row);
                });
            }
        }
    } else {
        // Original view for single class
        data.forEach(entry => {
            const row = document.createElement('tr');
            row.innerHTML = `
                <td>${currentClass}</td>
                <td>${entry.name}</td>
                <td>${entry.date}</td>
                <td>${entry.attendance}</td>
                <td>${entry.description}</td>
                <td>
                    ${canEdit ? `<button class="edit-button" onclick="openEditRecordForm('${entry.id}', '${currentClass}')">Edit</button>` : ''}
                </td>
            `;
            attendanceTableBody.appendChild(row);
        });
    }
}



// Setup Event Listeners
function setupEventListeners() {
    // Control Buttons
    if (document.querySelectorAll('.control-button')) {
        document.querySelectorAll('.control-button').forEach(button => {
            button.addEventListener('click', function () {
                const action = this.getAttribute('data-action');
                if (action) {
                    handleControlAction(action);
                }
            });
        });
    }
     
    const controlButtons = document.querySelectorAll('.control-button');
    controlButtons.forEach(button => {
        button.addEventListener('click', function() {
            const action = this.getAttribute('data-action');
            handleControlAction(action);
        });
    });
    // Hamburger Menu
    if (hamburgerMenu) {
        hamburgerMenu.addEventListener('click', toggleHamburgerMenu);
    }

    // Class Selection Change
    if (classSelect) {
        classSelect.addEventListener('change', function () {
            currentClass = this.value;
            loadPersons();
            if (currentPage === 'attendance') {
                loadAttendance();
            } else if (currentPage === 'person_management') {
                populatePersonTable();
            }
        });
    }

    // Search Input
if (nameSearchInput) {
    nameSearchInput.addEventListener('input', function() {
        applyFilters(); // Do not close the filter dropdown
    });
}


    // Close Modals on outside click
    if (document.querySelectorAll('.modal')) {
        document.querySelectorAll('.modal').forEach(modal => {
            modal.addEventListener('click', function (event) {
                if (event.target === modal) {
                    closeForm(modal.id);
                }
            });
        });
    }

    // Previous and Next Month Buttons
    if (prevMonthButton && nextMonthButton) {
        document.addEventListener('DOMContentLoaded', function () {
            // Make sure event listeners are attached only once
            if (!prevMonthButton.getAttribute('data-listener-attached')) {
                prevMonthButton.addEventListener('click', () => changeMonth(-1));
                prevMonthButton.setAttribute('data-listener-attached', true);
            }

            if (!nextMonthButton.getAttribute('data-listener-attached')) {
                nextMonthButton.addEventListener('click', () => changeMonth(1));
                nextMonthButton.setAttribute('data-listener-attached', true);
            }
        });
    }

    // Add Record Form Submit
    if (document.getElementById('addRecordForm')) {
        document.getElementById('addRecordForm').addEventListener('submit', function (e) {
            e.preventDefault();
            addRecord();
        });
    }

    // Add Person Form Submit
    if (document.getElementById('addPersonForm')) {
        document.getElementById('addPersonForm').addEventListener('submit', function (e) {
            e.preventDefault();
            addPerson();
        });
    }

    // Bulk Attendance Form Submit
    if (document.getElementById('bulkAttendanceForm')) {
        document.getElementById('bulkAttendanceForm').addEventListener('submit', function (e) {
            e.preventDefault();
            addBulkAttendance();
        });
    }

    // Edit Record Form Submit
    if (document.getElementById('editRecordForm')) {
        document.getElementById('editRecordForm').addEventListener('submit', function (e) {
            e.preventDefault();
            updateRecord();
        });
    }

    // View Person Select Change
    if (document.getElementById('viewPersonSelect')) {
        document.getElementById('viewPersonSelect').addEventListener('change', loadPersonData);
    }

    // Add Record Form Class Change
    if (document.getElementById('recordClass')) {
        document.getElementById('recordClass').addEventListener('change', function () {
            const selectedClass = this.value;
            loadPersonsForForm(selectedClass, recordNameChoices);
        });
    }

    // Bulk Attendance Form Class Change
    if (document.getElementById('bulkRecordClass')) {
        document.getElementById('bulkRecordClass').addEventListener('change', function () {
            const selectedClass = this.value;
            loadPersonsForForm(selectedClass, bulkRecordNamesChoices);
        });
    }

    // View/Edit Person Form Class Change
    if (document.getElementById('viewPersonUnit')) {
        document.getElementById('viewPersonUnit').addEventListener('change', function () {
            const selectedClass = this.value;
            loadPersonsForForm(selectedClass, viewPersonChoices);
        });
    }
}

// Handle Control Actions
function handleControlAction(action) {
    switch (action) {
        case 'addRecordForm':
            openForm('addRecordForm');
            break;
        case 'addPersonForm':
            openForm('addPersonForm');
            break;
        case 'bulkAttendanceForm':
            openForm('bulkAttendanceForm');
            break;
        case 'calendar':
            toggleView('calendar');
            break;
        case 'table':
            toggleView('table');
            break;
        case 'downloadMonthlyData':
            downloadMonthlyData();
            break;

        case 'importAttendanceForm':
            openForm('importAttendanceForm');
            break;
    
        case 'importPersonForm':
            openForm('importPersonModal');
            break;

        case 'manageTagsForm':
            openForm('manageTagsModal');
            loadTagsForManagement();
            break;
    
        case 'refreshData':
            refreshData();
            break;
    
        default:
            showToast('Unknown action.');
            break;
    }
}

// Toggle Hamburger Menu
function toggleHamburgerMenu() {
    if (navbarMenu) {
        navbarMenu.classList.toggle('show');
    }
}

// Open Form Modal
function openForm(formId) {
    const form = document.getElementById(formId);
    if (form) {
        form.classList.remove('hidden');
        form.classList.add('show');
        // Trigger loading persons for default selected class
        if (formId === 'addRecordForm' && currentPage === 'attendance') {
            const recordClassSelect = document.getElementById('recordClass');
            const selectedClass = recordClassSelect.value || allowedClasses[0];
            recordClassSelect.value = selectedClass;
            loadPersonsForForm(selectedClass, recordNameChoices);
        } else if (formId === 'bulkAttendanceForm' && currentPage === 'attendance') {
            const bulkRecordClassSelect = document.getElementById('bulkRecordClass');
            const selectedClass = bulkRecordClassSelect.value || allowedClasses[0];
            bulkRecordClassSelect.value = selectedClass;
            loadPersonsForForm(selectedClass, bulkRecordNamesChoices);
        } 
    } else {
        showToast(`Form with ID '${formId}' not found.`);
    }
}


// Close Form Modal
function closeForm(formId) {
    const form = document.getElementById(formId);
    if (form) {
        // Reset the form fields
        const formElement = form.querySelector('form');
        if (formElement) {
            formElement.reset();
        }

        // Reset any Choices.js instances related to this form
        if (formId === 'addRecordForm' && currentPage === 'attendance') {
            recordNameChoices.removeActiveItems();
            const selectedClass = document.getElementById('recordClass').value;
            loadPersonsForForm(selectedClass, recordNameChoices);
            toggleDescription(); // Hide description fields if visible
        } else if (formId === 'addPersonForm') {
            // No Choices.js instances in addPersonForm
        } else if (formId === 'bulkAttendanceForm' && currentPage === 'attendance') {
            bulkRecordNamesChoices.removeActiveItems();
            const selectedClass = document.getElementById('bulkRecordClass').value;
            loadPersonsForForm(selectedClass, bulkRecordNamesChoices);
        } else if (formId === 'editPersonModal' && currentPage === 'person_management') {
            currentEditingPersonId = null;

        } else if (formId === 'viewPersonModal' && currentPage === 'person_management') {
            currentEditingPersonId = null;

        } else if (formId === 'editRecordForm' && currentPage === 'attendance') {
            // No Choices.js instances to reset in editRecordForm
            clearModalError('editRecord'); // Clear any previous errors
        } else if (formId === 'signUpModal') {
            // Reset sign-up form fields
            document.getElementById('signUpForm').reset();
        }
        // Hide the modal
        form.classList.add('hidden');
        form.classList.remove('show');
    } else {
        showToast(`Form with ID '${formId}' not found.`);
    }
}

// Close Modal when clicking outside content
function closeModal(event) {
    if (event.target === event.currentTarget) {
        event.currentTarget.classList.add('hidden');
    }
}
// Populate Class Select Dropdown
function populateClassSelect() {
    classSelect.innerHTML = '';
    // Add "All Classes" option
    const allOption = document.createElement('option');
    allOption.value = 'جميع القطاعات';
    allOption.textContent = 'جميع القطاعات';
    classSelect.appendChild(allOption);

    allowedClasses.forEach(cls => {
        const option = document.createElement('option');
        option.value = cls;

        // Check the value and set the display text accordingly mobtade2
        if (cls === 'ashbal') {
            option.textContent = 'قطاع اشبال';
        } else if (cls === 'bara3emBoys') {
            option.textContent = 'قطاع براعم ولاد';
        } else if (cls === 'bara3emGirls') {
            option.textContent = 'قطاع براعم بنات';
        } else if (cls === 'morshedatMotkademat') {
            option.textContent = 'قطاع مرشدات متقدمات';
        } else if (cls === 'morshedat') {
            option.textContent = 'قطاع مرشدات';
        } else if (cls === 'ra2edat') {
            option.textContent = 'قطاع رائدات';
        } else if (cls === 'mobtade2') {
            option.textContent = 'قطاع مبتدأ';
        } else if (cls === 'gawala') {
            option.textContent = 'قطاع جوالة';
        } else if (cls === 'zahrat') {
            option.textContent = 'قطاع زهرات';
        } else if (cls === 'kashaf') {
            option.textContent = 'قطاع كشاف';
        } else if (cls === 'motkadem') {
            option.textContent = 'قطاع متقدم';
        }
        else {
            option.textContent = cls;
        }

        classSelect.appendChild(option);
    });


    // Set "All Classes" as default
    currentClass = 'جميع القطاعات';
    classSelect.value = currentClass;
    loadPersons();
    loadAttendance();
}

// Show Toast Notification
function showToast(message) {
    toast.textContent = message;
    toast.className = 'show';
    setTimeout(() => {
        toast.className = toast.className.replace('show', '');
    }, 3000);
}

// Additional functions specific to each page will be included below
// For example, loadPersons, loadAttendance, populatePersonTable, etc.

// [Include all other functions from your original scripts.js, ensuring they are wrapped with checks for currentPage and element existence]

// ...

// Setup Role Options on the Landing Page
function setupRoleOptions() {
    const roleOptions = document.getElementById('roleOptions');
    if (!roleOptions) return;

    // Clear any existing options
    roleOptions.innerHTML = '';

    // Attendance option
    const attendanceButton = document.createElement('button');
    attendanceButton.textContent = 'Attendance';
    attendanceButton.classList.add('control-button');
    attendanceButton.addEventListener('click', () => {
        window.location.href = 'attendance.html';
    });
    roleOptions.appendChild(attendanceButton);

    // Person Management option
    const personManagementButton = document.createElement('button');
    personManagementButton.textContent = 'Person Management';
    personManagementButton.classList.add('control-button');
    personManagementButton.addEventListener('click', () => {
        window.location.href = 'person_management.html';
    });
    roleOptions.appendChild(personManagementButton);

    // User Management option (only for SuperAdmin)
    if (isSuperAdmin) {
        const userManagementButton = document.createElement('button');
        userManagementButton.textContent = 'User Management';
        userManagementButton.classList.add('control-button');
        userManagementButton.addEventListener('click', () => {
            window.location.href = 'user_management.html';
        });
        roleOptions.appendChild(userManagementButton);
    }
}
// Open Edit Record Form
function openEditRecordForm(id, cls) {
    if (!canEdit) {
        showToast('You do not have permission to edit records.');
        return;
    }
    editRecordId = id;
    const record = attendanceData.find(entry => entry.id === id && entry.class === cls);
    if (record) {
        // Set the class name and name as read-only inputs
        document.getElementById('editRecordClass').value = record.class;
        document.getElementById('editRecordName').value = record.name;
        document.getElementById('editRecordDate').value = record.date;
        document.getElementById('editRecordAttendance').value = record.attendance;
        document.getElementById('editRecordDescription').value = record.description || '';
        toggleEditDescription(); // Show/hide description based on attendance
        openForm('editRecordForm'); // Open the edit modal
    } else {
        showToast('Record not found.');
    }
}


// Update Record (with cache update)
function updateRecord() {
    if (!canEdit) {
        showToast('You do not have permission to update records.');
        return;
    }
    const selectedRecordId = editRecordId;
    const className = document.getElementById('editRecordClass').value;

    if (!selectedRecordId) {
        showModalError('editRecord', 'No record selected for editing.');
        return;
    }

    const dateInput = document.getElementById('editRecordDate').value;
    const dateParts = dateInput.split('-');
    const date = new Date(parseInt(dateParts[0]), parseInt(dateParts[1]) - 1, parseInt(dateParts[2]), 12, 0, 0);
    const attendance = document.getElementById('editRecordAttendance').value;
    const description = document.getElementById('editRecordDescription').value.trim();

    const updatedRecord = {
        date: firebase.firestore.Timestamp.fromDate(date),
        attendance: attendance,
        description: description
    };

    db.collection('classes').doc(className).collection('attendance').doc(selectedRecordId).update(updatedRecord)
        .then(() => {
            // Update the cache
            let classAttendance = attendanceCache[className];
            if (classAttendance) {
                const index = classAttendance.findIndex(entry => entry.id === selectedRecordId);
                if (index !== -1) {
                    const dateObj = updatedRecord.date.toDate();
                    const year = dateObj.getFullYear();
                    const month = ('0' + (dateObj.getMonth() + 1)).slice(-2);
                    const day = ('0' + dateObj.getDate()).slice(-2);
                    const dateStr = `${year}-${month}-${day}`;

                    classAttendance[index] = {
                        ...classAttendance[index],
                        date: dateStr,
                        attendance: updatedRecord.attendance,
                        description: updatedRecord.description || ''
                    };
                }
            }

            // Also update attendanceData array
            const attendanceIndex = attendanceData.findIndex(entry => entry.id === selectedRecordId);
            if (attendanceIndex !== -1) {
                const dateObj = updatedRecord.date.toDate();
                const year = dateObj.getFullYear();
                const month = ('0' + (dateObj.getMonth() + 1)).slice(-2);
                const day = ('0' + dateObj.getDate()).slice(-2);
                const dateStr = `${year}-${month}-${day}`;

                attendanceData[attendanceIndex] = {
                    ...attendanceData[attendanceIndex],
                    date: dateStr,
                    attendance: updatedRecord.attendance,
                    description: updatedRecord.description || ''
                };
            }

            showToast('Record updated successfully.');
            closeForm('editRecordForm');
            editRecordId = null;
            clearModalError('editRecord'); // Clear any previous errors
        })
        .catch(error => {
            showModalError('editRecord', 'Error updating record: ' + error.message);
        });
}

// Toggle Filter Dropdown Visibility
function toggleFilterDropdown() {
    const filterDropdownContent = document.getElementById('filterDropdownContent');
    if (filterDropdownContent.classList.contains('show')) {
        filterDropdownContent.classList.remove('show');
        filterDropdownContent.classList.add('hidden');
    } else {
        filterDropdownContent.classList.remove('hidden');
        filterDropdownContent.classList.add('show');
    }
}

// Load Person Data for View/Edit
// Load Person Data for View/Edit
function loadPersonData() {
    const personIds = viewPersonChoices.getValue(true); // Returns an array
    const personId = personIds.length > 0 ? personIds[0] : null;
    const selectedClass = document.getElementById('viewPersonUnit').value; // Get selected class

    if (!selectedClass) {
        showModalError('viewPerson', 'Please select a class.');
        return;
    }

    if (!personId) {
        showModalError('viewPerson', 'Please select a person.');
        return;
    }

    clearModalError('viewPerson'); // Clear previous errors

    db.collection('classes').doc(selectedClass).collection('persons').doc(personId).get()
        .then(doc => {
            if (doc.exists) {
                const data = doc.data();
                document.getElementById('viewPersonAddress').value = data.address || '';
                document.getElementById('viewPersonDOB').value = data.dob || '';
                document.getElementById('viewPersonMobile').value = data.mobile || '';
                document.getElementById('viewPersonPhone').value = data.phone || '';
                document.getElementById('viewPersonEmail').value = data.email || '';
                document.getElementById('viewPersonSchool').value = data.school || '';
                document.getElementById('viewPersonAcademicYear').value = data.academicYear || '';
                document.getElementById('viewPersonFamily').value = data.family || '';
                document.getElementById('viewPersonServant').value = data.servant || '';
                document.getElementById('viewPersonAffiliation').value = data.affiliation || '';
                document.getElementById('viewPersonChurch').value = data.church || '';
                document.getElementById('viewPersonFolar').value = data.folar || '';
                document.getElementById('personData').classList.remove('hidden');
            } else {
                showModalError('viewPerson', 'Person not found.');
            }
        })
        .catch(error => {
            showModalError('viewPerson', 'Error loading person data: ' + error.message);
        });
}

function loadAllPersons() {
    allPersons = [];
    const classesToLoad = allowedClasses;

    let promises = classesToLoad.map(cls => {
        return db.collection('classes').doc(cls).collection('persons').get()
            .then(querySnapshot => {
                querySnapshot.forEach(doc => {
                    const data = doc.data();
                    allPersons.push({
                        id: doc.id,
                        name: data.name,
                        unit: cls
                    });
                });
            });
    });

    return Promise.all(promises).then(() => {
        populateFilterNameChoices();
    }).catch(error => {
        showToast('Error loading persons: ' + error.message);
    });
}



function populateFilterNameChoices() {
    // Ensure names are fully displayed
    const personOptions = allPersons.map(person => ({
        value: person.id,
        label: `${person.name} (${person.unit})` // Include unit for clarity
    }));

    if (filterNameChoices) {
        filterNameChoices.clearStore();
        filterNameChoices.setChoices(personOptions, 'value', 'label', true);
    }
}

// Toggle Description Input based on Attendance Status in Add Record Form
function toggleDescription() {
    const attendance = document.getElementById('recordAttendance').value;
    const descriptionLabel = document.getElementById('descriptionLabel');
    const descriptionInput = document.getElementById('recordDescription');

    if (attendance !== 'Attended') {
        descriptionLabel.classList.remove('hidden');
        descriptionInput.classList.remove('hidden');
    } else {
        descriptionLabel.classList.add('hidden');
        descriptionInput.classList.add('hidden');
    }
}


/**
 * Removes duplicate persons from the array based on their unique ID.
 * @param {Array} persons - Array of person objects.
 * @returns {Array} - Deduplicated array of persons.
 */
function deduplicatePersons(persons) {
    const uniquePersons = [];
    const personIds = new Set();

    persons.forEach(person => {
        if (!personIds.has(person.id)) {
            uniquePersons.push(person);
            personIds.add(person.id);
        }
    });

    return uniquePersons;
}

// Edit Person Data
// Edit Person Data


// Add Person (with cache update)
/**
 * Adds a new person to Firestore and updates the local cache.
 * Prevents duplication by validating unique mobile and email.
 */
async function addPerson() {
    if (!canEdit) {
        showToast('You do not have permission to add persons.');
        return;
    }

    // Collect form data
    const unit = document.getElementById('personUnit').value;
    const name = document.getElementById('personName').value.trim();
    const address = document.getElementById('personAddress').value.trim();
    const dob = document.getElementById('personDOB').value;
    const mobile = document.getElementById('personMobile').value.trim();
    const phone = document.getElementById('personPhone').value.trim();
    const email = document.getElementById('personEmail').value.trim();
    const school = document.getElementById('personSchool').value.trim();
    const academicYear = document.getElementById('personAcademicYear').value.trim();
    const family = document.getElementById('personFamily').value.trim();
    const servant = document.getElementById('personServant').value.trim();
    const affiliation = document.getElementById('personAffiliation').value.trim();
    const church = document.getElementById('personChurch').value.trim();
    const folar = document.getElementById('personFolar').value;

    // Basic validation for required fields
    if (!unit || !name || !address || !dob || !mobile || !folar) {
        showToast('Please fill in all required fields.');
        return;
    }

    const personsRef = db.collection('classes').doc(unit).collection('persons');

    try {
        // Check for duplicate mobile
        let querySnapshot = await personsRef.where('phone', '==', phone).get();
        if (!querySnapshot.empty) {
            showToast('A person with this mobile number already exists.');
            return;
        }

        // Check for duplicate email
        querySnapshot = await personsRef.where('email', '==', email).get();
        if (!querySnapshot.empty) {
            showToast('A person with this email already exists.');
            return;
        }

        const newPerson = {
            name: name,
            address: address,
            dob: dob,
            mobile: mobile,
            phone: phone,
            email: email,
            school: school,
            academicYear: academicYear,
            family: family,
            servant: servant,
            affiliation: affiliation,
            church: church,
            folar: folar
        };

        const docRef = await personsRef.add(newPerson);

        // Update the cache without introducing duplicates
        if (!classPersonsCache[unit]) {
            classPersonsCache[unit] = [];
        }

        // Check if the person already exists in the cache
        const existingPerson = classPersonsCache[unit].find(p => p.id === docRef.id);
        if (!existingPerson) {
            classPersonsCache[unit].push({
                id: docRef.id,
                name: name,
                unit: unit
            });
        }

        // Also update allPersons and ensure no duplicates
        allPersons.push({
            id: docRef.id,
            name: name,
            unit: unit,
            address: address,
            dob: dob,
            mobile: mobile,
            phone: phone,
            email: email,
            school: school,
            academicYear: academicYear,
            family: family,
            servant: servant,
            affiliation: affiliation,
            church: church,
            folar: folar,
            tags: [] // Assuming new person has no tags initially
        });

        // Deduplicate allPersons after adding
        allPersons = deduplicatePersons(allPersons);

        showToast('Person added successfully.');
        closeForm('addPersonForm');

        // Reset form fields
        document.getElementById('addPersonForm').reset();

        // Refresh the person table and selects to reflect the new addition
        populatePersonTable();
        populatePersonSelects();
    } catch (error) {
        showToast('Error adding person: ' + error.message);
        console.error('Error adding person:', error);
    }
}



// Download Attendance Data as Excel
function downloadAttendanceData(data, filename) {
    if (data.length === 0) {
        showToast('No attendance data available to download.');
        return;
    }

    // Prepare data with person details
    const exportData = data.map(entry => {
        return {
            'Class': entry.class,
            'Person ID': entry.personId,
            'Name': entry.name,
            'Date': entry.date,
            'Attendance': entry.attendance,
            'Description': entry.description || '',
            // Add additional person details here
            'Address': entry.address || '',
            'Date of Birth': entry.dob || '',
            'Mobile': entry.mobile || '',
            'Phone': entry.phone || '',
            'Email': entry.email || '',
            'School': entry.school || '',
            'Academic Year': entry.academicYear || '',
            'Family': entry.family || '',
            'Servant': entry.servant || '',
            'Affiliation': entry.affiliation || '',
            'Church': entry.church || '',
            'Folar': entry.folar || '',
        };
    });

    const worksheet = XLSX.utils.json_to_sheet(exportData);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Attendance");
    XLSX.writeFile(workbook, filename);
}


// Toggle Description Input based on Attendance Status in Edit Record Form
function toggleEditDescription() {
    const attendance = document.getElementById('editRecordAttendance').value;
    const descriptionLabel = document.getElementById('editDescriptionLabel');
    const descriptionInput = document.getElementById('editRecordDescription');

    if (attendance !== 'Attended') {
        descriptionLabel.classList.remove('hidden');
        descriptionInput.classList.remove('hidden');
    } else {
        descriptionLabel.classList.add('hidden');
        descriptionInput.classList.add('hidden');
    }
}

// Additional modifications to functions like loadPersons, loadAttendance, etc., based on currentPage

/**
 * Loads persons from Firestore based on the current class selection.
 * Utilizes caching to optimize data retrieval and prevents duplication.
 */
function loadPersons() {
    allPersons = []; // Reset the allPersons array to avoid accumulation
    let classesToLoad = [];

    if (currentClass === 'جميع القطاعات') { // "All Classes" in Arabic
        classesToLoad = allowedClasses;
    } else {
        classesToLoad = [currentClass];
    }

    const promises = classesToLoad.map(cls => {
        if (classPersonsCache[cls]) {
            // Use cached data if available
            allPersons = allPersons.concat(classPersonsCache[cls]);
            return Promise.resolve();
        } else {
            // Fetch from Firestore if not cached
            return db.collection('classes').doc(cls).collection('persons').get()
                .then(querySnapshot => {
                    const classPersons = [];
                    querySnapshot.forEach(doc => {
                        const data = doc.data();
                        classPersons.push({
                            id: doc.id,
                            name: data.name,
                            unit: cls,
                            address: data.address || '',
                            dob: data.dob || '',
                            mobile: data.mobile || '',
                            phone: data.phone || '',
                            email: data.email || '',
                            school: data.school || '',
                            academicYear: data.academicYear || '',
                            family: data.family || '',
                            servant: data.servant || '',
                            affiliation: data.affiliation || '',
                            church: data.church || '',
                            folar: data.folar || '',
                            tags: data.tags || []
                        });
                    });
                    // Cache the fetched persons
                    classPersonsCache[cls] = classPersons;
                    allPersons = allPersons.concat(classPersons);
                });
        }
    });

    Promise.all(promises)
        .then(() => {
            // Deduplicate the allPersons array
            allPersons = deduplicatePersons(allPersons);
            console.log('Loaded Persons:', allPersons); // For debugging

            // Populate the person table with deduplicated data
            populatePersonTable();

            // If using Choices.js for person selections, update them
            populatePersonSelects();
        })
        .catch(error => {
            showToast('Error loading persons: ' + error.message);
            console.error('Error loading persons:', error);
        });
}




// Populate Person Table
function populatePersonTable(persons = null) {
    if (!personTableBody) return;

    personTableBody.innerHTML = '';

    let displayPersons;
    if (persons) {
        displayPersons = persons;
    } else {
        displayPersons = currentClass === 'جميع القطاعات' ? allPersons : allPersons.filter(p => p.unit === currentClass);
    }

    if (displayPersons.length === 0) {
        const row = document.createElement('tr');
        row.innerHTML = `<td colspan="6" style="text-align:center;">No persons found.</td>`;
        personTableBody.appendChild(row);
        return;
    }

    displayPersons.forEach(person => {
        const tags = person.tags ? person.tags.join(', ') : '';
        const row = document.createElement('tr');
        if (person.unit == "ashbal"){
            tempunit = "قطاع اشبال";
        } else if (person.unit == "zahrat"){
            tempunit = "قطاع زهرات";
        } else if (person.unit == "mobtade2"){
            tempunit = "قطاع مبتدأ";
        } else if (person.unit == "motkadem"){
            tempunit = "قطاع متقدم";
        } else if (person.unit == "bara3emBoys"){
            tempunit = "قطاع براعم ولاد";
        } else if (person.unit == "bara3emGirls"){
            tempunit = "قطاع براعم بنات";
        } else if (person.unit == "gawala"){
            tempunit = "قطاع جوالة";
        } else if (person.unit == "kashaf"){
            tempunit = "قطاع كشاف";
        } else if (person.unit == "morshedat"){
            tempunit = "قطاع مرشدات";
        } else if (person.unit == "morshedatMotkademat"){
            tempunit = "قطاع مرشدات متقدمات";
        } else {
            tempunit = person.unit;
        }
        row.innerHTML = `
            <td>${tempunit}</td>
            <td>${person.name}</td>
            <td>${tags}</td>
            <td>
                <button class="control-button person-action" onclick="viewPerson('${person.id}', '${person.unit}')">View</button>
            </td>
            <td>
                ${canEdit ? `<button class="control-button person-action" onclick="editPerson('${person.id}', '${person.unit}')">Edit</button>` : ''}
            </td>
            <td>
                ${canEdit ? `<button class="control-button person-action"  onclick="deletePerson('${person.id}', '${person.unit}')">Delete</button>` : ''}
            </td>
        `;
        personTableBody.appendChild(row);
    });
}

function deletePerson(personId, className) {
    if (!canEdit) {
        showToast('You do not have permission to delete persons.');
        return;
    }

    const confirmation = confirm('Are you sure you want to delete this person and all their attendance records? This action cannot be undone.');
    if (!confirmation) return;

    const personRef = db.collection('classes').doc(className).collection('persons').doc(personId);
    const attendanceRef = db.collection('classes').doc(className).collection('attendance');

    // Delete attendance records
    attendanceRef.where('personId', '==', personId).get()
        .then(snapshot => {
            const batch = db.batch();
            snapshot.forEach(doc => {
                batch.delete(doc.ref);
            });
            batch.delete(personRef);
            return batch.commit();
        })
        .then(() => {
            showToast('Person and their attendance records deleted successfully.');
            // Remove the person from the cache
            if (classPersonsCache[className]) {
                classPersonsCache[className] = classPersonsCache[className].filter(p => p.id !== personId);
            }
            // Refresh the person table
            loadPersons();
        })
        .catch(error => {
            showToast('Error deleting person: ' + error.message);
        });
}


function exportPersons() {
    let exportData = [];

    // Get the persons to export based on filters, search, and class
    let personsToExport = [];

    // Apply class filter
    if (currentClass === 'جميع القطاعات') {
        personsToExport = allPersons.slice(); // Copy all persons
    } else {
        personsToExport = allPersons.filter(p => p.unit === currentClass);
    }

    // Apply search query
    const searchQuery = personSearchInput ? personSearchInput.value.toLowerCase() : '';
    if (searchQuery) {
        personsToExport = personsToExport.filter(person => person.name.toLowerCase().includes(searchQuery));
    }

    // Apply additional filters
    if (currentFilters) {
        // Apply Folar Filter
        if (currentFilters.folar) {
            personsToExport = personsToExport.filter(person => person.folar === currentFilters.folar);
        }

        // Apply Month of DOB Filter
        if (currentFilters.monthDOB) {
            personsToExport = personsToExport.filter(person => {
                const dobMonth = new Date(person.dob).getMonth() + 1; // getMonth() is 0-based
                return ('0' + dobMonth).slice(-2) === currentFilters.monthDOB;
            });
        }

        // Apply Tags Filter
        if (currentFilters.tags.length > 0) {
            personsToExport = personsToExport.filter(person => {
                if (!person.tags) return false;
                return currentFilters.tags.every(tag => person.tags.includes(tag));
            });
        }
    }

    if (personsToExport.length === 0) {
        showToast('No persons data available to export.');
        return;
    }

    // Prepare data for export
    exportData = personsToExport.map(person => {
        return {
            'Class': person.unit,
            'Name': person.name,
            'Address': person.address || '',
            'Date of Birth': person.dob || '',
            'Mobile': person.mobile || '',
            'Phone': person.phone || '',
            'Email': person.email || '',
            'School': person.school || '',
            'Academic Year': person.academicYear || '',
            'Family': person.family || '',
            'Servant Name': person.servant || '',
            'Affiliation': person.affiliation || '',
            'Church': person.church || '',
            'Received Folar?': person.folar || '',
            'Tags': person.tags ? person.tags.join(', ') : ''
        };
    });

    const worksheet = XLSX.utils.json_to_sheet(exportData);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Persons");
    const filename = `Persons_${currentClass !== 'جميع القطاعات' ? currentClass : 'All_Classes'}.xlsx`;
    XLSX.writeFile(workbook, filename);
}



// Populate Person Select Dropdowns
function populatePersonSelects() {
    const personOptions = allPersons.map(person => ({
        value: person.id,
        label: `${person.name} (${person.unit})` // Include unit for clarity
    }));

    // Update Filter Name Choices
    if (filterNameChoices) {
        filterNameChoices.clearStore();
        filterNameChoices.setChoices(personOptions, 'value', 'label', true);
    }

    // Populate Bulk Record Names Choices (Filter based on selected class)
    if (bulkRecordNamesChoices) {
        const bulkPersonOptions = currentClass === 'جميع القطاعات' ? personOptions : personOptions.filter(p => p.unit === currentClass);
        bulkRecordNamesChoices.clearStore();
        bulkRecordNamesChoices.setChoices(bulkPersonOptions, 'value', 'label', true);
    }

    // Populate Record Name Choices (Filter based on selected class)
    if (recordNameChoices) {
        const recordPersonOptions = currentClass === 'جميع القطاعات' ? personOptions : personOptions.filter(p => p.unit === currentClass);
        recordNameChoices.clearStore();
        recordNameChoices.setChoices(recordPersonOptions, 'value', 'label', true);
    }

    // Populate View Person Choices
    if (viewPersonChoices) {
        viewPersonChoices.clearStore();
        viewPersonChoices.setChoices(personOptions, 'value', 'label', true);
    }
}


// Generate Calendar View
function generateCalendarView(data = attendanceData) {
    calendar.innerHTML = '';
    currentMonthYear.textContent = new Date(currentYear, currentMonth).toLocaleString('default', { month: 'long', year: 'numeric' });
    const daysInMonth = new Date(currentYear, currentMonth + 1, 0).getDate();

    for (let day = 1; day <= daysInMonth; day++) {
        const dateObj = new Date(currentYear, currentMonth, day);
        const year = dateObj.getFullYear();
        const month = ('0' + (dateObj.getMonth() + 1)).slice(-2);
        const dayStr = ('0' + dateObj.getDate()).slice(-2);
        const dateStr = `${year}-${month}-${dayStr}`;
        const dayData = data.filter(entry => entry.date === dateStr);

        const dayDiv = document.createElement('div');
        dayDiv.classList.add('calendar-day');

        dayDiv.innerHTML = `
            <span class="day-name">${dateObj.toLocaleString('default', { weekday: 'short' })}</span>
            <span class="day-number">${day}</span>
        `;

        if (dayData.length > 0) {
            if (currentClass === 'جميع القطاعات') {
                // Group by class
                const classGroups = {};
                dayData.forEach(entry => {
                    if (!classGroups[entry.class]) {
                        classGroups[entry.class] = [];
                    }
                    classGroups[entry.class].push(entry.name);
                });

                for (const cls in classGroups) {
                    const classHeading = document.createElement('div');
                    classHeading.innerHTML = `<strong>${cls}</strong>`;
                    dayDiv.appendChild(classHeading);

                    const namesDiv = document.createElement('div');
                    namesDiv.classList.add('names');
                    namesDiv.innerHTML = classGroups[cls].map(name => `<span title="${name}">${name}</span>`).join('<br>');
                    dayDiv.appendChild(namesDiv);
                }
            } else {
                // Original view for single class
                const namesDiv = document.createElement('div');
                namesDiv.classList.add('names');
                namesDiv.innerHTML = dayData.map(entry => `<span title="${entry.name}">${entry.name}</span>`).join('<br>');
                dayDiv.appendChild(namesDiv);
            }

            dayDiv.classList.add('attended');

            // Add the download button
            const downloadButton = document.createElement('button');
            downloadButton.classList.add('download-button');
            downloadButton.textContent = 'Download';
            downloadButton.addEventListener('click', () => downloadDailyAttendance(dateStr));
            dayDiv.appendChild(downloadButton);
        } else {
            dayDiv.classList.add('not-attended');
        }

        calendar.appendChild(dayDiv);
    }

    updateMonthButtons();
}
// Download Monthly Data as Excel
function downloadMonthlyData() {
    const filteredData = attendanceData.filter(entry => {
        const entryDate = new Date(entry.date);
        return entryDate.getMonth() === currentMonth && entryDate.getFullYear() === currentYear;
    });

    if (filteredData.length === 0) {
        showToast('No attendance data available for this month.');
        return;
    }

    downloadAttendanceData(filteredData, `Attendance_${currentMonth + 1}_${currentYear}.xlsx`);
}


// Download Daily Attendance as Excel
function downloadDailyAttendance(dateStr) {
    const filteredData = attendanceData.filter(entry => entry.date === dateStr);

    if (filteredData.length === 0) {
        showToast('No attendance data available for this day.');
        return;
    }

    downloadAttendanceData(filteredData, `Attendance_${dateStr}.xlsx`);
}



// Update Month Navigation Buttons
function updateMonthButtons() {
    const prevMonthDate = new Date(currentYear, currentMonth - 1);
    const nextMonthDate = new Date(currentYear, currentMonth + 1);

    prevMonthButton.innerHTML = `&#10094; ${prevMonthDate.toLocaleString('default', { month: 'long' })}`;
    nextMonthButton.innerHTML = `${nextMonthDate.toLocaleString('default', { month: 'long' })} &#10095;`;
}



// Change Month
function changeMonth(delta) {
    currentMonth += delta;
    if (currentMonth < 0) {
        currentMonth = 11;
        currentYear--;
    } else if (currentMonth > 11) {
        currentMonth = 0;
        currentYear++;
    }
    generateCalendarView();
}



// Load Attendance Data from Firestore based on currentClass (with caching)
// Keep track of Firestore unsubscribe functions

function loadAttendance() {
    // Clear existing data
    attendanceData = [];
    attendanceCache = {};

    // Unsubscribe from any previous listeners
    attendanceUnsubscribers.forEach(unsub => unsub());
    attendanceUnsubscribers = [];

    let classesToLoad = [];
    if (currentClass === 'جميع القطاعات') {
        classesToLoad = allowedClasses;
    } else {
        classesToLoad = [currentClass];
    }

    classesToLoad.forEach(cls => {
        const attendanceRef = db.collection('classes').doc(cls).collection('attendance');

        // Listen for real-time updates
        const unsubscribe = attendanceRef.onSnapshot(snapshot => {
            // Clear class-specific attendance cache
            attendanceCache[cls] = [];

            snapshot.forEach(doc => {
                const data = doc.data();
                const dateObj = data.date.toDate();
                const year = dateObj.getFullYear();
                const month = ('0' + (dateObj.getMonth() + 1)).slice(-2);
                const day = ('0' + dateObj.getDate()).slice(-2);
                const dateStr = `${year}-${month}-${day}`;

                const attendanceEntry = {
                    id: doc.id,
                    class: cls,
                    personId: data.personId,
                    name: data.name,
                    date: dateStr,
                    attendance: data.attendance,
                    description: data.description || '',
                    // Include additional person details if necessary
                };

                attendanceCache[cls].push(attendanceEntry);
            });

            // Reconstruct attendanceData from the updated cache
            attendanceData = [];
            for (const classEntries of Object.values(attendanceCache)) {
                attendanceData = attendanceData.concat(classEntries);
            }

            // Update the UI
            applyFilters();
        }, error => {
            showToast('Error loading attendance data: ' + error.message);
        });

        // Store the unsubscribe function
        attendanceUnsubscribers.push(unsubscribe);
    });
}


// Helper function to fetch person details
function fetchPersonDetails(className, personIds) {
    let personsRef = db.collection('classes').doc(className).collection('persons');
    let promises = personIds.map(personId => {
        return personsRef.doc(personId).get().then(doc => {
            if (doc.exists) {
                return { personId: doc.id, data: doc.data() };
            } else {
                return null;
            }
        });
    });

    return Promise.all(promises).then(results => {
        let personDetails = {};
        results.forEach(item => {
            if (item) {
                personDetails[item.personId] = item.data;
            }
        });
        return personDetails;
    });
}




// Add Record (with cache update)
function addRecord() {
    if (!canEdit) {
        showToast('You do not have permission to add records.');
        return;
    }

    const className = document.getElementById('recordClass').value;
    const nameIds = recordNameChoices.getValue(true);
    const personId = nameIds.length > 0 ? nameIds[0] : null;

    if (!personId) {
        showToast('Please select a person.');
        return;
    }

    // Use classPersonsCache to find the person
    const classPersons = classPersonsCache[className] || [];
    const person = classPersons.find(p => p.id === personId);
    if (!person) {
        showToast('Selected person not found in class.');
        return;
    }

    const dateInput = document.getElementById('recordDate').value;
    const dateParts = dateInput.split('-');
    const date = new Date(
        parseInt(dateParts[0]),
        parseInt(dateParts[1]) - 1,
        parseInt(dateParts[2]),
        12,
        0,
        0
    );
    const attendance = document.getElementById('recordAttendance').value;
    const description = document.getElementById('recordDescription').value.trim();

    if (!className) {
        showToast('Please select a class.');
        return;
    }

    const attendanceRef = db.collection('classes').doc(className).collection('attendance');

    // Check for duplicate record
    attendanceRef
        .where('personId', '==', personId)
        .where('date', '==', firebase.firestore.Timestamp.fromDate(date))
        .get()
        .then(querySnapshot => {
            if (!querySnapshot.empty) {
                showToast('A record for this person on this date already exists.');
                return;
            }

            const newRecord = {
                name: person.name,
                personId: person.id,
                date: firebase.firestore.Timestamp.fromDate(date),
                attendance: attendance,
                description: description
            };

            attendanceRef
                .add(newRecord)
                .then((docRef) => {
                    // Update the cache
                    const dateObj = newRecord.date.toDate();
                    const year = dateObj.getFullYear();
                    const month = ('0' + (dateObj.getMonth() + 1)).slice(-2);
                    const day = ('0' + dateObj.getDate()).slice(-2);
                    const dateStr = `${year}-${month}-${day}`;

                    const newAttendanceEntry = {
                        id: docRef.id,
                        class: className,
                        personId: person.id,
                        name: person.name,
                        date: dateStr,
                        attendance: newRecord.attendance,
                        description: newRecord.description || ''
                    };

                    if (!attendanceCache[className]) {
                        attendanceCache[className] = [];
                    }
                    attendanceCache[className].push(newAttendanceEntry);
                    attendanceData.push(newAttendanceEntry);

                    showToast('Record added successfully.');
                    closeForm('addRecordForm');
                    document.getElementById('addRecordFormElement').reset();
                    toggleDescription(); // Hide description if needed

                    // Update the UI to show the new record
                    applyFilters();
                })
                .catch(error => {
                    showToast('Error adding record: ' + error.message);
                });
        })
        .catch(error => {
            showToast('Error checking for duplicate record: ' + error.message);
        });
}


// Display error message inside a specific modal
function showModalError(modalId, message) {
    const errorElement = document.getElementById(`${modalId}Error`);
    if (errorElement) {
        errorElement.textContent = message;
        errorElement.style.display = 'block';
    }
}


// Clear error message inside a specific modal
function clearModalError(modalId) {
    const errorElement = document.getElementById(`${modalId}Error`);
    if (errorElement) {
        errorElement.textContent = '';
        errorElement.style.display = 'none';
    }
}


// Add Bulk Attendance
function addBulkAttendance() {
    if (!canEdit) {
        showToast('You do not have permission to add attendance.');
        return;
    }

    const className = document.getElementById('bulkRecordClass').value;
    const selectedNames = bulkRecordNamesChoices.getValue(true);
    const dateInput = document.getElementById('bulkRecordDate').value;
    const dateParts = dateInput.split('-');
    const date = new Date(
        parseInt(dateParts[0]),
        parseInt(dateParts[1]) - 1,
        parseInt(dateParts[2]),
        12,
        0,
        0
    );
    const attendance = document.getElementById('bulkRecordAttendance').value;

    if (!className || selectedNames.length === 0 || !dateInput || !attendance) {
        showToast('Please fill in all required fields.');
        return;
    }

    const attendanceRef = db.collection('classes').doc(className).collection('attendance');
    const dateTimestamp = firebase.firestore.Timestamp.fromDate(date);

    let duplicatePersons = [];
    let batch = db.batch();
    let newAttendanceEntries = [];
    let operationsCount = 0; // Initialize the operations counter

    // Use classPersonsCache to find persons
    const classPersons = classPersonsCache[className] || [];

    // First, check for duplicates
    let checkPromises = selectedNames.map(personId => {
        return attendanceRef
            .where('personId', '==', personId)
            .where('date', '==', dateTimestamp)
            .get()
            .then(querySnapshot => {
                if (!querySnapshot.empty) {
                    const person = classPersons.find(p => p.id === personId);
                    duplicatePersons.push(person ? person.name : 'Unknown');
                    return null; // Skip adding this person
                } else {
                    const person = classPersons.find(p => p.id === personId);
                    if (person) {
                        const attendanceDocRef = attendanceRef.doc();
                        const newRecord = {
                            name: person.name,
                            personId: person.id,
                            date: dateTimestamp,
                            attendance: attendance,
                            description: ''
                        };
                        batch.set(attendanceDocRef, newRecord);
                        operationsCount++; // Increment the counter

                        // Prepare the new attendance entry for cache and UI update
                        const dateObj = date;
                        const year = dateObj.getFullYear();
                        const month = ('0' + (dateObj.getMonth() + 1)).slice(-2);
                        const day = ('0' + dateObj.getDate()).slice(-2);
                        const dateStr = `${year}-${month}-${day}`;

                        const newAttendanceEntry = {
                            id: attendanceDocRef.id,
                            class: className,
                            personId: person.id,
                            name: person.name,
                            date: dateStr,
                            attendance: attendance,
                            description: ''
                        };
                        newAttendanceEntries.push(newAttendanceEntry);
                    }
                }
            });
    });

    Promise.all(checkPromises)
        .then(() => {
            if (duplicatePersons.length > 0) {
                showToast(
                    `Records already exist for: ${duplicatePersons.join(', ')}. They were not added again.`
                );
            }

            // Check if there are any operations to commit
            if (operationsCount === 0) {
                showToast('No new records were added.');
                return;
            }

            batch
                .commit()
                .then(() => {
                    // Update the cache and attendanceData
                    if (!attendanceCache[className]) {
                        attendanceCache[className] = [];
                    }
                    attendanceCache[className] = attendanceCache[className].concat(newAttendanceEntries);
                    attendanceData = attendanceData.concat(newAttendanceEntries);

                    showToast('Bulk attendance added successfully.');
                    closeForm('bulkAttendanceForm');
                    // Reset the form
                    const formElement = document.getElementById('bulkAttendanceFormElement');
                    if (formElement) {
                        formElement.reset();
                    }
                    bulkRecordNamesChoices.removeActiveItems();

                    // Update the UI to show the new records
                    applyFilters();
                })
                .catch(error => {
                    showToast('Error adding bulk attendance: ' + error.message);
                });
        })
        .catch(error => {
            showToast('Error checking for duplicate records: ' + error.message);
        });
}



// Wrap initialization code in DOMContentLoaded to ensure elements are loaded
document.addEventListener('DOMContentLoaded', function () {
    initializeChoices();
    setupEventListeners();    
});

// Refresh Data by Clearing Cache and Reloading
function refreshData() {
    // Clear caches and data
    classPersonsCache = {};
    attendanceCache = {};
    attendanceData = [];

    // Unsubscribe from attendance listeners
    attendanceUnsubscribers.forEach(unsub => unsub());
    attendanceUnsubscribers = [];

    // Reload data
    loadPersons();
    loadAttendance();
    showToast('Data refreshed.');
}



function populateAllClassSelects() {
    const classOptions = [];

    // Prepare class options 
    allowedClasses.forEach(cls => {
        let text = cls;
        if (cls === 'ashbal') {
            text = 'قطاع اشبال';
        } else if (cls === 'bara3emBoys') {
            text = 'قطاع براعم ولاد';
        } else if (cls === 'bara3emGirls') {
            text = 'قطاع براعم بنات';
        } else if (cls === 'morshedatMotkademat') {
            text = 'قطاع مرشدات متقدمات';
        } else if (cls === 'ra2edat') {
            text = 'قطاع رائدات';
        } else if (cls === 'morshedat') {
            text = 'قطاع مرشدات';
        } else if (cls === 'mobtade2') {
            text = 'قطاع مبتدأ';
        } else if (cls === 'gawala') {
            text = 'قطاع جوالة';
        } else if (cls === 'zahrat') {
            text = 'قطاع زهرات';
        } else if (cls === 'kashaf') {
            text = 'قطاع كشاف';
        } else if (cls === 'motkadem') {
            text = 'قطاع متقدم';
        }
        classOptions.push({ value: cls, text: text });
    });

    // Populate main classSelect (if exists)
    if (classSelect) {
        classSelect.innerHTML = '';
        // Add "All Classes" option
        const allOption = document.createElement('option');
        allOption.value = 'جميع القطاعات';
        allOption.textContent = 'جميع القطاعات';
        classSelect.appendChild(allOption);

        classOptions.forEach(optionData => {
            const option = document.createElement('option');
            option.value = optionData.value;
            option.textContent = optionData.text;
            classSelect.appendChild(option);
        });

        // Set default value
        currentClass = 'جميع القطاعات';
        classSelect.value = currentClass;
    }

    // Populate other class selects
    const recordClassSelect = document.getElementById('recordClass');
    if (recordClassSelect) {
        recordClassSelect.innerHTML = '';
        classOptions.forEach(optionData => {
            const option = document.createElement('option');
            option.value = optionData.value;
            option.textContent = optionData.text;
            recordClassSelect.appendChild(option);
        });
        // Set default value
        recordClassSelect.value = allowedClasses[0];
    }

    const bulkRecordClassSelect = document.getElementById('bulkRecordClass');
    if (bulkRecordClassSelect) {
        bulkRecordClassSelect.innerHTML = '';
        classOptions.forEach(optionData => {
            const option = document.createElement('option');
            option.value = optionData.value;
            option.textContent = optionData.text;
            bulkRecordClassSelect.appendChild(option);
        });
        // Set default value
        bulkRecordClassSelect.value = allowedClasses[0];
    }

    const personUnitSelect = document.getElementById('personUnit');
    if (personUnitSelect) {
        personUnitSelect.innerHTML = '';
        classOptions.forEach(optionData => {
            const option = document.createElement('option');
            option.value = optionData.value;
            option.textContent = optionData.text;
            personUnitSelect.appendChild(option);
        });
        // Set default value
        personUnitSelect.value = allowedClasses[0];
    }

    const viewPersonUnitSelect = document.getElementById('viewPersonUnit');
    if (viewPersonUnitSelect) {
        viewPersonUnitSelect.innerHTML = '';
        classOptions.forEach(optionData => {
            const option = document.createElement('option');
            option.value = optionData.value;
            option.textContent = optionData.text;
            viewPersonUnitSelect.appendChild(option);
        });
        // Set default value
        viewPersonUnitSelect.value = allowedClasses[0];
    }
}

// [Include other necessary functions and modifications]

function downloadAttendanceTemplate() {
    // Define the template structure
    const templateData = [
        {
            'Class': '',
            'Name': '',
            'Date': '',
            'Attendance': '', // Attended, Absent, Excused
            'Description': '',
        }
    ];

    const worksheet = XLSX.utils.json_to_sheet(templateData);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Template");
    XLSX.writeFile(workbook, 'Attendance_Template.xlsx');
}

async function processImportedAttendanceData(data) {
    if (!canEdit) {
        showToast('You do not have permission to import attendance.');
        return;
    }

    if (!Array.isArray(data) || data.length === 0) {
        showToast('No data found in the imported file.');
        return;
    }

    let batch = db.batch();
    let operationsCount = 0;
    let errors = [];

    for (let index = 0; index < data.length; index++) {
        const entry = data[index];
        const rowNumber = index + 2; // Adjust for header row

        const className = entry['Class'] ? entry['Class'].trim() : '';
        let personName = entry['Name'] ? entry['Name'].trim() : '';
        const dateStr = entry['Date'] ? entry['Date'].toString().trim() : '';
        const attendance = entry['Attendance'] ? entry['Attendance'].trim() : '';
        const description = entry['Description'] || '';

        // Validate data
        let missingFields = [];
        if (!className) missingFields.push('Class');
        if (!personName) missingFields.push('Name');
        if (!dateStr) missingFields.push('Date');
        if (!attendance) missingFields.push('Attendance');

        if (missingFields.length > 0) {
            errors.push({
                rowNumber,
                entry,
                reason: `Missing required fields: ${missingFields.join(', ')}.`
            });
            continue;
        }

        if (!allowedClasses.includes(className)) {
            errors.push({
                rowNumber,
                entry,
                reason: `You do not have permission for class ${className}.`
            });
            continue;
        }

        // Parse date
        let date;
        // Try parsing date in various formats
        if (/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
            // Format YYYY-MM-DD
            date = new Date(dateStr);
        } else if (/^\d{2}\/\d{2}\/\d{2}$/.test(dateStr)) {
            // Format MM/DD/YY
            const parts = dateStr.split('/');
            const month = parseInt(parts[0], 10) - 1; // Months are 0-based
            const day = parseInt(parts[1], 10);
            const year = parseInt(parts[2], 10) + 2000; // Adjust for 21st century
            date = new Date(year, month, day);
        } else if (/^\d{2}-\d{2}-\d{4}$/.test(dateStr)) {
            // Format DD-MM-YYYY
            const parts = dateStr.split('-');
            const day = parseInt(parts[0], 10);
            const month = parseInt(parts[1], 10) - 1; // Months are 0-based
            const year = parseInt(parts[2], 10);
            date = new Date(year, month, day);
        } else {
            errors.push({
                rowNumber,
                entry,
                reason: `Invalid date format. Use YYYY-MM-DD, MM/DD/YY, or DD-MM-YYYY.`
            });
            continue;
        }

        if (isNaN(date.getTime())) {
            errors.push({
                rowNumber,
                entry,
                reason: `Invalid date value.`
            });
            continue;
        }

        const dateTimestamp = firebase.firestore.Timestamp.fromDate(date);

        try {
            // Fetch person ID based on name
            const personData = await fetchPersonIdByName(className, personName);

            if (!personData) {
                errors.push({
                    rowNumber,
                    entry,
                    reason: `Person named "${personName}" not found in class ${className}.`
                });
                continue;
            }

            if (personData.duplicate) {
                errors.push({
                    rowNumber,
                    entry,
                    reason: `Multiple persons named "${personName}" found in class ${className}. Please use unique names or Person IDs.`
                });
                continue;
            }

            const personId = personData.id;
            personName = personData.name; // Update personName with the name from the database

            const attendanceRef = db.collection('classes').doc(className).collection('attendance');

            // Check for duplicate record
            const duplicateCheck = await attendanceRef
                .where('personId', '==', personId)
                .where('date', '==', dateTimestamp)
                .get();

            if (!duplicateCheck.empty) {
                // Duplicate record found
                errors.push({
                    rowNumber,
                    entry,
                    reason: `Attendance record already exists for ${personName} on ${dateStr}.`
                });
                continue;
            }

            // Prepare new record with name and personId
            const newRecord = {
                name: personName,
                personId: personId,
                date: dateTimestamp,
                attendance: attendance,
                description: description,
            };

            const attendanceDocRef = attendanceRef.doc();

            // Add to batch
            batch.set(attendanceDocRef, newRecord);
            operationsCount++;
        } catch (error) {
            errors.push({
                rowNumber,
                entry,
                reason: `Error processing record: ${error.message}`
            });
        }
    }

    if (operationsCount > 0) {
        // Commit batch
        batch.commit()
            .then(() => {
                showToast('Attendance data imported successfully.');
                closeForm('importAttendanceForm');
                // Refresh data
                refreshData();
            })
            .catch(error => {
                showToast('Error importing attendance data: ' + error.message);
            });
    } else {
        showToast('No valid records to import.');
    }

    if (errors.length > 0) {
        // Generate and download the error report
        downloadErrorReport(errors);
    }
}

function fetchPersonIdByName(className, personName) {
    const personsRef = db.collection('classes').doc(className).collection('persons');
    return personsRef.where('name', '==', personName).get().then(querySnapshot => {
        if (querySnapshot.empty) {
            // No matching person found
            return null;
        } else if (querySnapshot.size > 1) {
            // Duplicate names found
            return { duplicate: true };
        } else {
            // Single match found
            const doc = querySnapshot.docs[0];
            return { id: doc.id, name: doc.data().name };
        }
    }).catch(error => {
        console.error('Error fetching person by name:', error);
        return null;
    });
}

function importAttendance() {
    const fileInput = document.getElementById('attendanceFileInput');
    const file = fileInput.files[0];

    if (!file) {
        showToast('Please select a file to import.');
        return;
    }

    const reader = new FileReader();
    reader.onload = function (e) {
        const data = new Uint8Array(e.target.result);
        const workbook = XLSX.read(data, { type: 'array' });
        const firstSheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[firstSheetName];
        const importedData = XLSX.utils.sheet_to_json(worksheet);

        // Process and validate imported data
        processImportedAttendanceData(importedData);
    };
    reader.readAsArrayBuffer(file);
}
function goBackHome() {
    window.location.href = 'index.html';
}

function downloadErrorReport(errors) {
    if (errors.length === 0) return;

    // Prepare data for export
    const exportData = errors.map(error => {
        return {
            'Row Number': error.rowNumber,
            ...error.entry,
            'Rejection Reason': error.reason
        };
    });

    const worksheet = XLSX.utils.json_to_sheet(exportData);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Error Report");
    XLSX.writeFile(workbook, 'Import_Error_Report.xlsx');

    showToast('Some records were not imported due to errors. An error report has been downloaded.');
}
// Search Persons
const personSearchInput = document.getElementById('personSearch');
if (personSearchInput) {
    personSearchInput.addEventListener('input', function () {
        const query = this.value.toLowerCase();

        // If query is not empty, set currentClass to "جميع القطاعات" (All Classes)
        if (query && currentClass !== 'جميع القطاعات') {
            currentClass = 'جميع القطاعات';
            classSelect.value = currentClass;
            loadPersons(); // Reload persons to include all classes
        }

        applyCombinedFilters(query, currentFilters);
    });
}
// Current Filters State
// Current Filters State
let currentFilters = {
    folar: '',
    monthDOB: '',
    tags: []
};

// Function to Apply Combined Search and Filters
function applyCombinedFilters(searchQuery, filters) {
    let filteredPersons = allPersons;

    // Apply Search Query
    if (searchQuery) {
        filteredPersons = filteredPersons.filter(person => person.name.toLowerCase().includes(searchQuery));
    }

    // Apply Folar Filter
    if (filters.folar) {
        filteredPersons = filteredPersons.filter(person => person.folar === filters.folar);
    }

    // Apply Month of DOB Filter
    if (filters.monthDOB) {
        filteredPersons = filteredPersons.filter(person => {
            const dobMonth = new Date(person.dob).getMonth() + 1; // getMonth() is 0-based
            return ('0' + dobMonth).slice(-2) === filters.monthDOB;
        });
    }

    // Apply Tags Filter
    if (filters.tags.length > 0) {
        filteredPersons = filteredPersons.filter(person => {
            if (!person.tags) return false;
            return filters.tags.every(tag => person.tags.includes(tag));
        });
    }

    // Populate the table with filtered persons
    populatePersonTable(filteredPersons);
}

// Filter Persons
// Apply Filter Button
const applyFilterButton = document.getElementById('applyFilterButton');
if (applyFilterButton) {
    applyFilterButton.addEventListener('click', function () {
        const folar = document.getElementById('filterFolar').value;
        const monthDOB = document.getElementById('filterMonthDOB').value;
        const selectedTags = filterTagsChoices ? filterTagsChoices.getValue(true) : [];

        currentFilters.folar = folar;
        currentFilters.monthDOB = monthDOB;
        currentFilters.tags = selectedTags;

        const searchQuery = personSearchInput ? personSearchInput.value.toLowerCase() : '';

        applyCombinedFilters(searchQuery, currentFilters);
        closeForm('filterModal'); // Close the modal after applying filters
    });
}
const clearFilterButton = document.getElementById('clearFilterButton');

if (applyFilterButton) {
    applyFilterButton.addEventListener('click', function () {
        const folar = document.getElementById('filterFolar').value;
        const monthDOB = document.getElementById('filterMonthDOB').value;
        const selectedTags = filterTagsChoices ? filterTagsChoices.getValue(true) : [];

        currentFilters.folar = folar;
        currentFilters.monthDOB = monthDOB;
        currentFilters.tags = selectedTags;

        const searchQuery = personSearchInput ? personSearchInput.value.toLowerCase() : '';

        applyCombinedFilters(searchQuery, currentFilters);
    });
}

if (clearFilterButton) {
    clearFilterButton.addEventListener('click', function () {
        // Reset Filters
        document.getElementById('filterFolar').value = '';
        document.getElementById('filterMonthDOB').value = '';
        if (filterTagsChoices) {
            filterTagsChoices.removeActiveItems();
        }

        currentFilters = {
            folar: '',
            monthDOB: '',
            tags: []
        };

        const searchQuery = personSearchInput ? personSearchInput.value.toLowerCase() : '';

        applyCombinedFilters(searchQuery, currentFilters);
    });
}

// View Person Details
// View Person Function
function viewPerson(personId, className) {
    // Fetch person details
    db.collection('classes').doc(className).collection('persons').doc(personId).get()
        .then(doc => {
            if (doc.exists) {
                const data = doc.data();
                document.getElementById('viewPersonUnit').value = className;
                document.getElementById('viewPersonName').value = data.name || '';
                document.getElementById('viewPersonAddress').value = data.address || '';
                document.getElementById('viewPersonDOB').value = data.dob || '';
                document.getElementById('viewPersonMobile').value = data.mobile || '';
                document.getElementById('viewPersonPhone').value = data.phone || '';
                document.getElementById('viewPersonEmail').value = data.email || '';
                document.getElementById('viewPersonSchool').value = data.school || '';
                document.getElementById('viewPersonAcademicYear').value = data.academicYear || '';
                document.getElementById('viewPersonFamily').value = data.family || '';
                document.getElementById('viewPersonServant').value = data.servant || '';
                document.getElementById('viewPersonAffiliation').value = data.affiliation || '';
                document.getElementById('viewPersonChurch').value = data.church || '';
                document.getElementById('viewPersonFolar').value = data.folar || '';

                // Populate tags
                populateTagsInModal('viewPersonTags', data.tags || []);

                // Open the View Person Modal
                openForm('viewPersonModal');
            } else {
                showToast('Person not found.');
            }
        })
        .catch(error => {
            showToast('Error fetching person data: ' + error.message);
        });
}

// Load View Person Data
function loadViewPersonData(personId, className) {
    db.collection('classes').doc(className).collection('persons').doc(personId).get()
        .then(doc => {
            if (doc.exists) {
                const data = doc.data();
                document.getElementById('viewPersonAddress').value = data.address || '';
                document.getElementById('viewPersonDOB').value = data.dob || '';
                document.getElementById('viewPersonMobile').value = data.mobile || '';
                document.getElementById('viewPersonPhone').value = data.phone || '';
                document.getElementById('viewPersonEmail').value = data.email || '';
                document.getElementById('viewPersonSchool').value = data.school || '';
                document.getElementById('viewPersonAcademicYear').value = data.academicYear || '';
                document.getElementById('viewPersonFamily').value = data.family || '';
                document.getElementById('viewPersonServant').value = data.servant || '';
                document.getElementById('viewPersonAffiliation').value = data.affiliation || '';
                document.getElementById('viewPersonChurch').value = data.church || '';
                document.getElementById('viewPersonFolar').value = data.folar || '';

                // Populate tags
                populateTagsInModal('viewPersonTags', data.tags || []);

                document.getElementById('personData').classList.remove('hidden');
            } else {
                showToast('Person not found.');
            }
        })
        .catch(error => {
            showToast('Error loading person data: ' + error.message);
        });
}


// Load View Person Data
function loadViewPersonData(personId, className) {
    db.collection('classes').doc(className).collection('persons').doc(personId).get()
        .then(doc => {
            if (doc.exists) {
                const data = doc.data();
                document.getElementById('viewPersonAddress').value = data.address || '';
                document.getElementById('viewPersonDOB').value = data.dob || '';
                document.getElementById('viewPersonMobile').value = data.mobile || '';
                document.getElementById('viewPersonPhone').value = data.phone || '';
                document.getElementById('viewPersonEmail').value = data.email || '';
                document.getElementById('viewPersonSchool').value = data.school || '';
                document.getElementById('viewPersonAcademicYear').value = data.academicYear || '';
                document.getElementById('viewPersonFamily').value = data.family || '';
                document.getElementById('viewPersonServant').value = data.servant || '';
                document.getElementById('viewPersonAffiliation').value = data.affiliation || '';
                document.getElementById('viewPersonChurch').value = data.church || '';
                document.getElementById('viewPersonFolar').value = data.folar || '';
                // Populate tags
                populateTagsInModal('viewPersonTags', data.tags || []);
                document.getElementById('personData').classList.remove('hidden');
            } else {
                showToast('Person not found.');
            }
        })
        .catch(error => {
            showToast('Error loading person data: ' + error.message);
        });
}



// Edit Person Function
function editPerson(personId, className) {
    // Fetch person details
    db.collection('classes').doc(className).collection('persons').doc(personId).get()
        .then(doc => {
            if (doc.exists) {
                const data = doc.data();
                
                // Set personId in hidden input
                document.getElementById('editPersonId').value = personId;
                
                // Populate Unit Select and other fields
                loadEditPersonData(personId, className);
                
                openForm('editPersonModal');
            } else {
                showToast('Person not found.');
            }
        })
        .catch(error => {
            showToast('Error fetching person data: ' + error.message);
        });
}


// Load Edit Person Data
function loadEditPersonData(personId, className) {
    db.collection('classes').doc(className).collection('persons').doc(personId).get()
        .then(doc => {
            if (doc.exists) {
                const data = doc.data();
                
                // Populate Unit Select
                populateUnitSelect('editPersonUnit', className);
                // Store old class as data attribute
                document.getElementById('editPersonUnit').setAttribute('data-old-class', className);
                
                // Populate Name Field
                document.getElementById('editPersonName').value = data.name || '';
                
                // Populate Other Editable Fields
                document.getElementById('editPersonAddress').value = data.address || '';
                document.getElementById('editPersonDOB').value = data.dob || '';
                document.getElementById('editPersonMobile').value = data.mobile || '';
                document.getElementById('editPersonPhone').value = data.phone || '';
                document.getElementById('editPersonEmail').value = data.email || '';
                document.getElementById('editPersonSchool').value = data.school || '';
                document.getElementById('editPersonAcademicYear').value = data.academicYear || '';
                document.getElementById('editPersonFamily').value = data.family || '';
                document.getElementById('editPersonServant').value = data.servant || '';
                document.getElementById('editPersonAffiliation').value = data.affiliation || '';
                document.getElementById('editPersonChurch').value = data.church || '';
                document.getElementById('editPersonFolar').value = data.folar || '';
                
                // Populate Tags (Optional)
                populateTagsInModal('editPersonTags', data.tags || []);
                
                // Remove any error messages
                clearModalError('editPerson');
            } else {
                showToast('Person not found.');
            }
        })
        .catch(error => {
            showToast('Error loading person data: ' + error.message);
        });
}


// New Function to Populate Unit Select
function populateUnitSelect(selectId, selectedUnit) {
    const unitSelect = document.getElementById(selectId);
    if (!unitSelect) return;
    
    // Clear existing options
    unitSelect.innerHTML = '';
    
    // Populate with allowedClasses
    allowedClasses.forEach(cls => {
        const option = document.createElement('option');
        option.value = cls;
        option.textContent = cls; // You can modify this to display more user-friendly names if available
        if (cls === selectedUnit) {
            option.selected = true;
        }
        unitSelect.appendChild(option);
    });
    
}


// Update Person Details
// Update Person Details
// Updated Update Person Function
function updatePerson() {
    if (!canEdit) {
        showToast('You do not have permission to edit persons.');
        return;
    }

    const newClassName = document.getElementById('editPersonUnit').value;
    const personId = document.getElementById('editPersonId').value;

    if (!newClassName || !personId) {
        showToast('Please select a unit and person.');
        return;
    }

    // Collect form data
    const name = document.getElementById('editPersonName').value.trim();
    const address = document.getElementById('editPersonAddress').value.trim();
    const dob = document.getElementById('editPersonDOB').value;
    const mobile = document.getElementById('editPersonMobile').value.trim();
    const phone = document.getElementById('editPersonPhone').value.trim();
    const email = document.getElementById('editPersonEmail').value.trim();
    const school = document.getElementById('editPersonSchool').value.trim();
    const academicYear = document.getElementById('editPersonAcademicYear').value.trim();
    const family = document.getElementById('editPersonFamily').value.trim();
    const servant = document.getElementById('editPersonServant').value.trim();
    const affiliation = document.getElementById('editPersonAffiliation').value.trim();
    const church = document.getElementById('editPersonChurch').value.trim();
    const folar = document.getElementById('editPersonFolar').value;
    const tags = editPersonTagsChoices ? editPersonTagsChoices.getValue(true) : [];

    if (!name || !address || !dob || !mobile || !folar) {
        showToast('Person details are incomplete.');
        return;
    }

    // Prepare updated data
    const updatedData = {
        name: name,
        address: address,
        dob: dob,
        mobile: mobile,
        phone: phone,
        email: email,
        school: school,
        academicYear: academicYear,
        family: family,
        servant: servant,
        affiliation: affiliation,
        church: church,
        folar: folar,
        tags: tags
    };

    // Get the old class (unit) of the person
    const oldClassName = document.getElementById('editPersonUnit').getAttribute('data-old-class');

    if (oldClassName === newClassName) {
        // If the class hasn't changed, simply update the document
        const personsRef = db.collection('classes').doc(newClassName).collection('persons');
        personsRef.doc(personId).update(updatedData)
            .then(() => {
                showToast('Person details updated successfully.');
                closeForm('editPersonModal');
                // Refresh the person list
                loadPersons();
            })
            .catch(error => {
                showToast('Error updating person: ' + error.message);
            });
    } else {
        // Class has changed - move the person document
        const oldPersonsRef = db.collection('classes').doc(oldClassName).collection('persons');
        const newPersonsRef = db.collection('classes').doc(newClassName).collection('persons');

        // Delete the person from the old class and add to the new class
        const batch = db.batch();
        const oldPersonDocRef = oldPersonsRef.doc(personId);
        const newPersonDocRef = newPersonsRef.doc(personId); // Use the same ID

        batch.delete(oldPersonDocRef);
        batch.set(newPersonDocRef, updatedData);

        batch.commit()
            .then(() => {
                showToast('Person details updated and moved to new class successfully.');
                closeForm('editPersonModal');
                // Refresh the person list
                loadPersons();
            })
            .catch(error => {
                showToast('Error updating person: ' + error.message);
            });
    }
}


// Handle Create Tag Form Submission
const createTagForm = document.getElementById('createTagForm');
if (createTagForm) {
    createTagForm.addEventListener('submit', function (e) {
        e.preventDefault();
        createNewTag();
    });
}

function createNewTag() {
    const newTagName = document.getElementById('newTagName').value.trim();
    if (!newTagName) {
        showToast('Tag name cannot be empty.');
        return;
    }

    // Convert tag name to lowercase for case-insensitive comparison
    const newTagNameLower = newTagName.toLowerCase();

    // Check if tag already exists
    db.collection('tags').where('nameLower', '==', newTagNameLower).get()
        .then(snapshot => {
            if (!snapshot.empty) {
                showToast('Tag already exists.');
                return;
            }

            // Add new tag to Firestore with nameLower field
            return db.collection('tags').add({ name: newTagName, nameLower: newTagNameLower });
        })
        .then(() => {
            showToast('Tag created successfully.');
            closeForm('createTagModal');
            document.getElementById('createTagForm').reset();
            // Refresh tag selects
            refreshTagSelects();
        })
        .catch(error => {
            showToast('Error creating tag: ' + error.message);
        });
}


// Refresh Tag Selects after creating a new tag
function refreshTagSelects() {
    // For View and Edit modals
    populateTagsInModal('viewPersonTags', []);
    populateTagsInModal('editPersonTags', []);
    // For Add Person Form
    populateTagsInModal('addPersonTags', []);
    // For Filter Tags
    populateTagsInModal('filterTags', []);
    // For Manage Tags Modal (reload the tags)
}


// Populate Tags in Select Elements
// Populate Tags in Select Elements
// Populate Tags in Select Elements
function populateTagsInModal(selectId, selectedTags) {
    const tagSelect = document.getElementById(selectId);
    if (!tagSelect) return;

    // Clear existing options
    tagSelect.innerHTML = '';

    // Fetch all tags from Firestore
    db.collection('tags').get()
        .then(snapshot => {
            snapshot.forEach(doc => {
                const tag = doc.data().name;
                const option = document.createElement('option');
                option.value = tag;
                option.textContent = tag;
                if (selectedTags.includes(tag)) {
                    option.selected = true;
                }
                tagSelect.appendChild(option);
            });

            // Re-initialize Choices.js for the select
            switch (selectId) {
                case 'viewPersonTags':
                    if (viewPersonTagsChoices) {
                        viewPersonTagsChoices.destroy();
                    }
                    viewPersonTagsChoices = new Choices(`#${selectId}`, {
                        removeItemButton: true,
                        shouldSort: false,
                        searchResultLimit: 5,
                        searchPlaceholderValue: 'Search tags',
                        noResultsText: 'No tags found',
                        placeholderValue: 'Select tags',
                    });
                    if (selectedTags.length > 0) {
                        viewPersonTagsChoices.setChoiceByValue(selectedTags);
                    }
                    break;

                case 'editPersonTags':
                    if (editPersonTagsChoices) {
                        editPersonTagsChoices.destroy();
                    }
                    editPersonTagsChoices = new Choices(`#${selectId}`, {
                        removeItemButton: true,
                        shouldSort: false,
                        searchResultLimit: 5,
                        searchPlaceholderValue: 'Search tags',
                        noResultsText: 'No tags found',
                        placeholderValue: 'Select tags',
                    });
                    if (selectedTags.length > 0) {
                        editPersonTagsChoices.setChoiceByValue(selectedTags);
                    }
                    break;

                case 'addPersonTags':
                    if (addPersonTagsChoices) {
                        addPersonTagsChoices.destroy();
                    }
                    addPersonTagsChoices = new Choices(`#${selectId}`, {
                        removeItemButton: true,
                        shouldSort: false,
                        searchResultLimit: 5,
                        searchPlaceholderValue: 'Search tags',
                        noResultsText: 'No tags found',
                        placeholderValue: 'Select tags',
                    });
                    break;

                case 'filterTags':
                    if (filterTagsChoices) {
                        filterTagsChoices.destroy();
                    }
                    filterTagsChoices = new Choices(`#${selectId}`, {
                        removeItemButton: true,
                        shouldSort: false,
                        searchResultLimit: 5,
                        searchPlaceholderValue: 'Search tags',
                        noResultsText: 'No tags found',
                        placeholderValue: 'Select tags',
                    });
                    break;

                default:
                    console.warn(`Unknown selectId: ${selectId}`);
            }
        })
        .catch(error => {
            showToast('Error loading tags: ' + error.message);
        });
}


// Load Tags for Filter Dropdown
function loadFilterTags() {
    populateTagsInModal('filterTags', []);
}

// Load Tags for All Tag Selects
function loadTags() {
    db.collection('tags').get()
        .then(snapshot => {
            const tags = [];
            snapshot.forEach(doc => {
                tags.push(doc.data().name);
            });
            // Populate Tags in Add Person Form
            populateTagsInModal('addPersonTags', []);
            // Populate Tags in View Person Form
            populateTagsInModal('viewPersonTags', []);
            // Populate Tags in Edit Person Form
            populateTagsInModal('editPersonTags', []);
            // Populate Tags in Filter Dropdown
            populateTagsInModal('filterTags', []);
        })
        .catch(error => {
            showToast('Error loading tags: ' + error.message);
        });
}
// Open Create Tag Modal
const createTagButton = document.getElementById('createTagButton');
if (createTagButton) {
    createTagButton.addEventListener('click', function () {
        openForm('createTagModal');
    });
}

// Open Filter Modal
const filterByButton = document.getElementById('filterByButton');
if (filterByButton) {
    filterByButton.addEventListener('click', function () {
        openForm('filterModal');
    });
}

// Cancel Filter Button
const cancelFilterButton = document.getElementById('cancelFilterButton');
if (cancelFilterButton) {
    cancelFilterButton.addEventListener('click', function () {
        closeForm('filterModal');
    });
}
function downloadPersonTemplate() {
    const templateData = [
        {
            'Class': '',
            'Name': '',
            'Address': '',
            'Date of Birth': '', // Acceptable formats: YYYY-MM-DD, MM/DD/YY, DD-MM-YYYY
            'Mobile': '',
            'Phone': '',
            'Email': '',
            'School': '',
            'Academic Year': '',
            'Family': '',
            'Servant Name': '',
            'Affiliation': '',
            'Church': '',
            'Received Folar?': '', // Yes or No
            'Tags': '' // Comma-separated tags
        }
    ];

    const worksheet = XLSX.utils.json_to_sheet(templateData);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Template");
    XLSX.writeFile(workbook, 'Person_Import_Template.xlsx');
}

function importPersons() {
    const fileInput = document.getElementById('personFileInput');
    const file = fileInput.files[0];

    if (!file) {
        showToast('Please select a file to import.');
        return;
    }

    const reader = new FileReader();
    reader.onload = function (e) {
        const data = new Uint8Array(e.target.result);
        const workbook = XLSX.read(data, { type: 'array' });
        const firstSheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[firstSheetName];
        const importedData = XLSX.utils.sheet_to_json(worksheet, { raw: true }); // Enable raw to get cell types

        // Process and validate imported data
        processImportedPersonData(importedData);
    };
    reader.readAsArrayBuffer(file);
}

    
async function processImportedPersonData(data) {
    if (!canEdit) {
        showToast('You do not have permission to import persons.');
        return;
    }

    if (!Array.isArray(data) || data.length === 0) {
        showToast('No data found in the imported file.');
        return;
    }

    let batch = db.batch();
    let operationsCount = 0;
    let errors = [];

    // Helper function to sanitize and trim entry values
    function sanitizeEntryValue(value) {
        if (value === undefined || value === null) {
            return '';
        }
        return value.toString().trim();
    }

    // Helper function to convert Excel serial date to JS Date
    function excelSerialDateToJSDate(serial) {
        const utc_days = Math.floor(serial - 25569);
        const utc_value = utc_days * 86400 * 1000; // Convert days to milliseconds
        const date_info = new Date(utc_value);

        const fractional_day = serial - Math.floor(serial) + 0.0000001;

        const total_seconds = Math.floor(86400 * fractional_day);

        const seconds = total_seconds % 60;

        const total_minutes = Math.floor(total_seconds / 60);
        const minutes = total_minutes % 60;

        const hours = Math.floor(total_minutes / 60);

        return new Date(date_info.getFullYear(), date_info.getMonth(), date_info.getDate(), hours, minutes, seconds);
    }

    for (let index = 0; index < data.length; index++) {
        const entry = data[index];
        const rowNumber = index + 2; // Adjust for header row

        // Log the entry for debugging purposes (optional)
        // console.log(`Processing row ${rowNumber}:`, entry);

        // Extract and sanitize data from entry
        const className = sanitizeEntryValue(entry['Class']);
        const name = sanitizeEntryValue(entry['Name']);
        const address = sanitizeEntryValue(entry['Address']);
        const dobRaw = entry['Date of Birth']; // Keep raw for type checking
        const mobile = sanitizeEntryValue(entry['Mobile']);
        const phone = sanitizeEntryValue(entry['Phone']);
        const email = sanitizeEntryValue(entry['Email']);
        const school = sanitizeEntryValue(entry['School']);
        const academicYear = sanitizeEntryValue(entry['Academic Year']);
        const family = sanitizeEntryValue(entry['Family']);
        const servant = sanitizeEntryValue(entry['Servant Name']);
        const affiliation = sanitizeEntryValue(entry['Affiliation']);
        const church = sanitizeEntryValue(entry['Church']);
        const folar = sanitizeEntryValue(entry['Received Folar?']);
        const tagsStr = sanitizeEntryValue(entry['Tags']);

        // Validate required fields
        let missingFields = [];
        if (!className) missingFields.push('Class');
        if (!name) missingFields.push('Name');
        // if (!address) missingFields.push('Address');
        // if (!dobRaw) missingFields.push('Date of Birth');
        // if (!mobile) missingFields.push('Mobile');
        // if (!phone) missingFields.push('Phone');
        // if (!email) missingFields.push('Email');
        // if (!school) missingFields.push('School');
        // if (!academicYear) missingFields.push('Academic Year');
        // if (!family) missingFields.push('Family');
        // if (!servant) missingFields.push('Servant Name');
        // if (!affiliation) missingFields.push('Affiliation');
        // if (!church) missingFields.push('Church');
        if (!folar) missingFields.push('Received Folar?');

        if (missingFields.length > 0) {
            errors.push({
                rowNumber,
                entry,
                reason: `Missing required fields: ${missingFields.join(', ')}.`
            });
            continue;
        }

        if (!allowedClasses.includes(className)) {
            errors.push({
                rowNumber,
                entry,
                reason: `You do not have permission for class ${className}.`
            });
            continue;
        }

        // Parse date of birth
        let dob;
        if (typeof dobRaw === 'number') {
            // Excel serial date
            dob = excelSerialDateToJSDate(dobRaw);
        } else if (typeof dobRaw === 'string') {
            // Existing parsing logic
            if (/^\d{4}-\d{2}-\d{2}$/.test(dobRaw)) {
                // Format YYYY-MM-DD
                dob = new Date(dobRaw);
            } else if (/^\d{2}\/\d{2}\/\d{2}$/.test(dobRaw)) {
                // Format MM/DD/YY
                const parts = dobRaw.split('/');
                const month = parseInt(parts[0], 10) - 1; // Months are 0-based
                const day = parseInt(parts[1], 10);
                const year = parseInt(parts[2], 10) + 2000; // Adjust for 21st century
                dob = new Date(year, month, day);
            } else if (/^\d{2}-\d{2}-\d{4}$/.test(dobRaw)) {
                // Format DD-MM-YYYY
                const parts = dobRaw.split('-');
                const day = parseInt(parts[0], 10);
                const month = parseInt(parts[1], 10) - 1; // Months are 0-based
                const year = parseInt(parts[2], 10);
                dob = new Date(year, month, day);
            } else if (!isNaN(Date.parse(dobRaw))) {
                // Try parsing with Date.parse()
                dob = new Date(dobRaw);
            } else {
                errors.push({
                    rowNumber,
                    entry,
                    reason: `Invalid date format for Date of Birth. Use YYYY-MM-DD, MM/DD/YY, or DD-MM-YYYY.`
                });
                continue;
            }
        } else {
            errors.push({
                rowNumber,
                entry,
                reason: `Invalid data type for Date of Birth.`
            });
            continue;
        }

        if (isNaN(dob.getTime())) {
            errors.push({
                rowNumber,
                entry,
                reason: `Invalid date value for Date of Birth.`
            });
            continue;
        }

        // Format the date as "YYYY-MM-DD"
        const formattedDob = dob.toISOString().split('T')[0];

        // Handle tags
        let tags = tagsStr ? tagsStr.split(',').map(tag => tag.trim()).filter(tag => tag) : [];

        // Prepare new person data
        const newPersonData = {
            name: name,
            address: address,
            dob: formattedDob, // Store the formatted date string
            mobile: mobile,
            phone: phone,
            email: email,
            school: school,
            academicYear: academicYear,
            family: family,
            servant: servant,
            affiliation: affiliation,
            church: church,
            folar: folar,
            tags: tags
        };

        try {
            const personsRef = db.collection('classes').doc(className).collection('persons');

            // // Check for duplicate mobile or email
            const mobileCheck = await personsRef.where('phone', '==', phone).get();
            if (!mobileCheck.empty) {
                errors.push({
                    rowNumber,
                    entry,
                    reason: `A person with mobile number ${phone} already exists in class ${className}.`
                });
                continue;
            }

            const emailCheck = await personsRef.where('email', '==', email).get();
            if (!emailCheck.empty) {
                errors.push({
                    rowNumber,
                    entry,
                    reason: `A person with email ${email} already exists in class ${className}.`
                });
                continue;
            }

            // Add person to batch
            const personDocRef = personsRef.doc();
            batch.set(personDocRef, newPersonData);
            operationsCount++;

            // Handle tags: create new tags if they don't exist
            await handleTags(tags);

            // Update cache
            if (!classPersonsCache[className]) {
                classPersonsCache[className] = [];
            }
            classPersonsCache[className].push({
                id: personDocRef.id,
                name: name,
                unit: className
            });

            // Optional: Commit batch every 500 operations to avoid exceeding Firestore limits
            if (operationsCount % 500 === 0) {
                await batch.commit();
                batch = db.batch(); // Start a new batch
            }

        } catch (error) {
            errors.push({
                rowNumber,
                entry,
                reason: `Error processing record: ${error.message}`
            });
        }
    }

    // Commit any remaining operations in the batch
    if (operationsCount > 0) {
        try {
            await batch.commit();
            showToast('Person data imported successfully.');
            closeForm('importPersonModal');
            // Refresh data
            loadPersons();
            // Reset the file input
            document.getElementById('personFileInput').value = '';
        } catch (error) {
            showToast('Error importing person data: ' + error.message);
        }
    } else {
        showToast('No valid records to import.');
    }

    if (errors.length > 0) {
        // Generate and download the error report
        downloadPersonErrorReport(errors);
    }
}

/**
 * Ensures that all tags in the provided array exist in Firestore.
 * Creates new tags if they do not already exist.
 * @param {Array} tags - Array of tag names to ensure existence.
 * @returns {Promise<void>}
 */
async function handleTags(tags) {
    if (!tags || !Array.isArray(tags) || tags.length === 0) return;
    
    const tagsRef = db.collection('tags');
    const existingTags = new Set();

    // Fetch all existing tags
    const snapshot = await tagsRef.get();
    snapshot.forEach(doc => {
        existingTags.add(doc.data().name.toLowerCase()); // Use lowercase for case-insensitive comparison
    });

    const batch = db.batch();
    let hasNewTags = false;

    tags.forEach(tag => {
        const tagLower = tag.toLowerCase();
        if (!existingTags.has(tagLower)) {
            const tagDocRef = tagsRef.doc(); // Auto-generated ID
            batch.set(tagDocRef, { name: tag });
            existingTags.add(tagLower);
            hasNewTags = true;
        }
    });

    if (hasNewTags) {
        await batch.commit();
        console.log('New tags created and batch committed.');
        refreshTagSelects(); // Update tag selects in the UI
    } else {
        console.log('No new tags to create.');
    }
}


function downloadPersonErrorReport(errors) {
    if (errors.length === 0) return;

    // Prepare data for export
    const exportData = errors.map(error => {
        return {
            'Row Number': error.rowNumber,
            ...error.entry,
            'Rejection Reason': error.reason
        };
    });

    const worksheet = XLSX.utils.json_to_sheet(exportData);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Error Report");
    XLSX.writeFile(workbook, 'Person_Import_Error_Report.xlsx');

    showToast('Some records were not imported due to errors. An error report has been downloaded.');
}

function sanitizeEntryValue(value) {
    if (value === undefined || value === null) {
        return '';
    }
    return value.toString().trim();
}

function loadTagsForManagement() {
    if (isLoadingTags) {
        console.log('loadTagsForManagement is already running. Skipping duplicate call.');
        return;
    }

    isLoadingTags = true;
    console.log('loadTagsForManagement called');

    const tagsTableBody = document.getElementById('tagsTableBody');
    if (!tagsTableBody) {
        isLoadingTags = false;
        return;
    }

    // Clear existing rows
    tagsTableBody.innerHTML = '';

    db.collection('tags').get()
        .then(snapshot => {
            console.log('Number of tags fetched:', snapshot.size);

            snapshot.forEach(doc => {
                const tagName = doc.data().name;
                const tagId = doc.id;

                console.log('Processing tag:', tagName, 'ID:', tagId);

                const row = document.createElement('tr');

                const nameCell = document.createElement('td');
                nameCell.textContent = tagName;

                const actionsCell = document.createElement('td');

                // Edit Button
                const editButton = document.createElement('button');
                editButton.textContent = 'Edit';
                editButton.classList.add('control-button');
                editButton.classList.add('tag-actions');
                editButton.onclick = () => editTag(tagId, tagName);

                // Delete Button
                const deleteButton = document.createElement('button');
                deleteButton.textContent = 'Delete';
                deleteButton.classList.add('control-button');
                deleteButton.classList.add('tag-actions');
                deleteButton.onclick = () => deleteTag(tagId, tagName);

                actionsCell.appendChild(editButton);
                actionsCell.appendChild(deleteButton);

                row.appendChild(nameCell);
                row.appendChild(actionsCell);

                tagsTableBody.appendChild(row);
            });
        })
        .catch(error => {
            showToast('Error loading tags: ' + error.message);
        })
        .finally(() => {
            isLoadingTags = false;
        });
}




function editTag(tagId, currentName) {
    const newTagName = prompt('Enter new name for the tag:', currentName);
    if (newTagName === null || newTagName.trim() === '') {
        // User cancelled or entered empty name
        return;
    }
    const trimmedName = newTagName.trim();

    // Check if another tag with the new name already exists
    db.collection('tags').where('name', '==', trimmedName).get()
        .then(snapshot => {
            if (!snapshot.empty) {
                showToast('A tag with this name already exists.');
                return;
            }

            // Update tag name in Firestore
            db.collection('tags').doc(tagId).update({ name: trimmedName })
                .then(() => {
                    showToast('Tag updated successfully.');
                    // Update tag name in persons who have this tag
                    updatePersonsTagName(currentName, trimmedName);
                })
                .catch(error => {
                    showToast('Error updating tag: ' + error.message);
                });
        })
        .catch(error => {
            showToast('Error checking for existing tag: ' + error.message);
        });
}


function updatePersonsTagName(oldTagName, newTagName) {
    const classesToUpdate = allowedClasses; // Or specify the classes you need

    const promises = classesToUpdate.map(className => {
        const personsRef = db.collection('classes').doc(className).collection('persons');
        return personsRef.where('tags', 'array-contains', oldTagName).get()
            .then(snapshot => {
                const batch = db.batch();
                snapshot.forEach(doc => {
                    const personRef = doc.ref;
                    const updatedTags = doc.data().tags.map(tag => tag === oldTagName ? newTagName : tag);
                    batch.update(personRef, { tags: updatedTags });
                });
                return batch.commit();
            });
    });

    Promise.all(promises)
        .then(() => {
            showToast('Tag name updated in persons.');
            loadTagsForManagement();
            refreshTagSelects();
            loadPersons(); // Refresh persons if necessary
        })
        .catch(error => {
            showToast('Error updating tag in persons: ' + error.message);
        });
}

function deleteTag(tagId, tagName) {
    const confirmation = confirm(`Are you sure you want to delete the tag "${tagName}"? This action cannot be undone.`);
    if (!confirmation) return;

    const classesToUpdate = allowedClasses; // Or specify the classes you need

    const promises = classesToUpdate.map(className => {
        const personsRef = db.collection('classes').doc(className).collection('persons');
        return personsRef.where('tags', 'array-contains', tagName).get()
            .then(snapshot => {
                const batch = db.batch();
                snapshot.forEach(doc => {
                    const personRef = doc.ref;
                    batch.update(personRef, {
                        tags: firebase.firestore.FieldValue.arrayRemove(tagName)
                    });
                });
                return batch.commit();
            });
    });

    // After updating persons, delete the tag document
    Promise.all(promises)
        .then(() => {
            return db.collection('tags').doc(tagId).delete();
        })
        .then(() => {
            showToast('Tag deleted successfully.');
            loadTagsForManagement();
            refreshTagSelects();
            loadPersons(); // Refresh persons if necessary
        })
        .catch(error => {
            showToast('Error deleting tag: ' + error.message);
        });
}

function editUser(email, currentRole) {
    // Open the editUserModal and populate fields
    document.getElementById('editUserId').value = email;
    document.getElementById('editUserEmail').value = email;
    // Set password field as empty or prompt for new password
    document.getElementById('editUserPassword').value = '';

    // Populate Roles Checkboxes
    const rolesContainer = document.getElementById('editUserRolesContainer');
    rolesContainer.innerHTML = ''; // Clear existing roles

    // Define all possible roles
    const roles = [
        'SuperAdmin',
        'Full Viewer',
        'Full Editor',
        'ashbal Viewer',
        'ashbal Editor',
        'bara3emBoys Viewer',
        'bara3emBoys Editor',
        // Add other class-specific roles
    ];

    roles.forEach(role => {
        const checkbox = document.createElement('input');
        checkbox.type = 'checkbox';
        checkbox.id = `editRole_${role}`;
        checkbox.value = role;
        if (currentRole === role) {
            checkbox.checked = true;
        }

        const label = document.createElement('label');
        label.htmlFor = `editRole_${role}`;
        label.textContent = role;

        rolesContainer.appendChild(checkbox);
        rolesContainer.appendChild(label);
        rolesContainer.appendChild(document.createElement('br'));
    });

    openForm('editUserModal');
}

function updateUser() {
    if (!canEdit) {
        showToast('You do not have permission to edit users.');
        return;
    }

    const email = document.getElementById('editUserEmail').value.trim();
    const password = document.getElementById('editUserPassword').value;
    const roles = Array.from(document.querySelectorAll('#editUserRolesContainer input[type="checkbox"]:checked')).map(cb => cb.value);

    if (roles.length === 0) {
        showToast('Please select at least one role.');
        return;
    }

    // Update roles in Firestore
    db.collection('users').doc(email).update({
        role: roles[0] // Assuming single role; modify if multiple roles are allowed
    }).then(() => {
        showToast('User updated successfully.');
        closeForm('editUserModal');
        // Refresh the users table
        populateUsersTable();
    }).catch(error => {
        showToast('Error updating user: ' + error.message);
    });

    // Update password if provided
    if (password) {
        auth.currentUser.updatePassword(password)
            .then(() => {
                console.log('Password updated successfully.');
            })
            .catch(error => {
                console.error('Error updating password:', error);
            });
    }
}

function populateUsersTable() {
    const usersTableBody = document.getElementById('usersTable').querySelector('tbody');
    usersTableBody.innerHTML = ''; // Clear existing rows

    db.collection('users').onSnapshot(snapshot => {
        usersTableBody.innerHTML = ''; // Clear existing rows on every snapshot

        snapshot.forEach(doc => {
            const userData = doc.data();
            const row = document.createElement('tr');

            const emailCell = document.createElement('td');
            emailCell.textContent = doc.id; // Assuming email is the document ID

            const roleCell = document.createElement('td');
            roleCell.textContent = userData.role;

            const actionsCell = document.createElement('td');

            // Edit Button
            const editButton = document.createElement('button');
            editButton.textContent = 'Edit';
            editButton.classList.add('control-button');
            editButton.onclick = () => editUser(doc.id, userData.role);

            actionsCell.appendChild(editButton);

            row.appendChild(emailCell);
            row.appendChild(roleCell);
            row.appendChild(actionsCell);

            usersTableBody.appendChild(row);
        });
    }, error => {
        showToast('Error fetching users: ' + error.message);
        console.error('Error fetching users:', error);
    });
}




Okay lets focus on the pagination and how it works first , now there are so many things that have to change:
- as a user when I try to change the class of ashbal to gawala, the object of the ashbal is deleted from the local storage so when I change back from gawala to ashbal it loads it again from the firestore, and this is incorrect, as I need it to be stored as if I changed the class back from gawala class to ashbal class, it should be there as not to fetch the data again from the firestore.
- as a user when I try to search for example all the persons with the name Tony, lets say there are 30 different persons named Tony so what should happen is that when I search for this value it should show the first 10 persons with the name Tony and if I clicked the pagination next page it should show the second 10 and etc.. and this should not affect the edit person as the edit person still be working if I tried to edit a person from the search results. and the same thing applies to the filter options Folar?, Date of birth, and the Tags.
- as a user when I search for the name Tony, and the results appear, if I tried to filter with all the persons named Tony and at the same thing they are are married and this is a tag, it should show the first 10 persons with the name tony and married at the same time, and when I click the next page it should show the second 10 and etc.. and this also applies to the other filters as well.

