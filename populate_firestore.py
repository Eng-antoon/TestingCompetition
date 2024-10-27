import firebase_admin
from firebase_admin import credentials, firestore
from faker import Faker
import random
from datetime import datetime, timedelta

# Initialize Faker
fake = Faker()

# Initialize Firebase Admin SDK
cred = credentials.Certificate('serviceAccountKey.json')  # Replace with your path
firebase_admin.initialize_app(cred)

# Initialize Firestore client
db = firestore.client()

# Define roles
roles = [
    'SuperAdmin',
    'Full Viewer',
    'Full Editor',
    'motkadem Viewer',
    'motkadem Editor',
    'kashaf Viewer',
    'kashaf Editor',
    'zahrat Viewer',
    'zahrat Editor',
    'gawala Viewer',
    'gawala Editor',
    'bara3em Viewer',
    'bara3em Editor',
    'ashbal Viewer',
    'ashbal Editor',
    'ra2edat Viewer',
    'ra2edat Editor'
]

# Define classes
classes = [
    'motkadem',
    'kashaf',
    'zahrat',
    'gawala',
    'bara3em',
    'ashbal',
    'ra2edat'
]

# Function to create user roles in Firestore
def create_user_roles():
    users_collection = db.collection('users')
    # Create SuperAdmin
    superadmin_email = 'superadmin@example.com'
    users_collection.document(superadmin_email).set({
        'role': 'SuperAdmin'
    })
    print(f'Created user: {superadmin_email} with role SuperAdmin')
    
    # Create Full Viewer and Full Editor
    for i in range(1, 6):
        viewer_email = f'fullviewer{i}@example.com'
        editor_email = f'fulleditor{i}@example.com'
        users_collection.document(viewer_email).set({
            'role': 'Full Viewer'
        })
        users_collection.document(editor_email).set({
            'role': 'Full Editor'
        })
        print(f'Created user: {viewer_email} with role Full Viewer')
        print(f'Created user: {editor_email} with role Full Editor')
    
    # Create Class-Specific Roles
    for cls in classes:
        viewer_email = f'{cls}_viewer@example.com'
        editor_email = f'{cls}_editor@example.com'
        users_collection.document(viewer_email).set({
            'role': f'{cls} Viewer'
        })
        users_collection.document(editor_email).set({
            'role': f'{cls} Editor'
        })
        print(f'Created user: {viewer_email} with role {cls} Viewer')
        print(f'Created user: {editor_email} with role {cls} Editor')

# Function to create classes in Firestore (if needed)
def create_classes():
    classes_collection = db.collection('classes')
    for cls in classes:
        classes_collection.document(cls).set({
            'name': cls,
            'description': fake.sentence(nb_words=10)
        })
        print(f'Created class: {cls}')

# Function to create persons in each class
def create_persons(num_persons_per_class=50):
    classes_collection = db.collection('classes')
    persons_counter = 0
    for cls in classes:
        persons_collection = classes_collection.document(cls).collection('persons')
        for _ in range(num_persons_per_class):
            person_id = persons_collection.document().id
            person_data = {
                'name': fake.name(),
                'address': fake.address(),
                'dob': fake.date_of_birth(minimum_age=18, maximum_age=65).isoformat(),
                'mobile': fake.phone_number(),
                'phone': fake.phone_number(),
                'email': fake.email(),
                'school': fake.company(),
                'academicYear': f"{random.randint(2015, 2023)}-{random.randint(2016, 2024)}",
                'family': fake.first_name(),
                'servant': fake.name(),
                'affiliation': fake.company(),
                'church': fake.company(),
                'folar': random.choice(['Yes', 'No'])
            }
            persons_collection.document(person_id).set(person_data)
            persons_counter += 1
        print(f'Created {num_persons_per_class} persons in class {cls}')
    print(f'Total persons created: {persons_counter}')

# Function to create attendance records for persons
def create_attendance_records(start_date='2023-01-01', end_date='2023-12-31'):
    classes_collection = db.collection('classes')
    attendance_counter = 0
    for cls in classes:
        persons_collection = classes_collection.document(cls).collection('persons')
        attendance_collection = classes_collection.document(cls).collection('attendance')
        # Fetch all persons in the class
        persons = persons_collection.stream()
        for person in persons:
            # Randomly select number of attendance records per person
            num_records = random.randint(50, 100)  # Adjust as needed
            for _ in range(num_records):
                random_date = fake.date_between(start_date=start_date, end_date=end_date)
                attendance_status = random.choices(
                    ['Attended', 'Absent', 'Excused'],
                    weights=[70, 20, 10],
                    k=1
                )[0]
                description = fake.sentence(nb_words=6) if attendance_status != 'Attended' else ''
                attendance_data = {
                    'name': person.to_dict()['name'],
                    'date': random_date,
                    'attendance': attendance_status,
                    'description': description
                }
                attendance_collection.add(attendance_data)
                attendance_counter += 1
        print(f'Created attendance records for class {cls}')
    print(f'Total attendance records created: {attendance_counter}')

# Function to run all population steps
def populate_database():
    print('Starting database population...')
    create_user_roles()
    create_classes()
    create_persons(num_persons_per_class=50)  # Adjust number as needed
    create_attendance_records(start_date='2023-01-01', end_date='2023-12-31')
    print('Database population completed.')

if __name__ == '__main__':
    populate_database()

