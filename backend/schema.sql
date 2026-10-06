create extension if not exists pgcrypto;

create table if not exists users (
 id uuid primary key default gen_random_uuid(),
 email text unique not null,
 password_hash text not null,
 role text not null check(role in('admin','teacher')),
 display_name text,
 created_at timestamptz default now()
);

create table if not exists applications (
 id uuid primary key default gen_random_uuid(),
 application_id text unique not null,
 first_name text not null,
 middle_name text,
 last_name text not null,
 gender text not null check(gender in('Male','Female')),
 dob date not null,
 fayda_id varchar(16) not null check(fayda_id ~ '^[0-9]{16}$'),
 phone text not null,
 country text not null default 'Ethiopia',
 region text not null,
 city text not null,
 woreda text not null,
 sub_city_or_zone text,
 kebele text,
 specific_address text,
 academic_year text not null,
 grade int not null check(grade between 9 and 12),
 section text not null check(section in('Section A','Section B','Section C','Section D')),
 study_option text,
 student_photo_url text,
 guardian_full_name text not null,
 guardian_phone text not null,
 guardian_fayda_id varchar(16) not null check(guardian_fayda_id ~ '^[0-9]{16}$'),
 guardian_country text not null default 'Ethiopia',
 guardian_region text not null,
 guardian_city text not null,
 guardian_woreda text not null,
 guardian_sub_city_or_zone text,
 guardian_kebele text,
 guardian_specific_address text,
 guardian_photo_url text,
 status text not null default 'Pending' check(status in('Pending','Accepted','Rejected')),
 student_id text unique,
 created_at timestamptz default now(),
 updated_at timestamptz default now()
);

create table if not exists students (
 id uuid primary key default gen_random_uuid(),
 student_id text unique not null,
 application_id uuid unique references applications(id),
 first_name text not null,
 middle_name text,
 last_name text not null,
 full_name text not null,
 gender text not null,
 dob date not null,
 fayda_id varchar(16) not null check(fayda_id ~ '^[0-9]{16}$'),
 phone text not null,
 country text not null default 'Ethiopia',
 region text not null,
 city text not null,
 woreda text not null,
 sub_city_or_zone text,
 kebele text,
 specific_address text,
 academic_year text not null,
 grade int not null check(grade between 9 and 12),
 section text not null check(section in('Section A','Section B','Section C','Section D')),
 study_option text,
 student_photo_url text,
 guardian_full_name text not null,
 guardian_phone text not null,
 guardian_fayda_id varchar(16) not null check(guardian_fayda_id ~ '^[0-9]{16}$'),
 guardian_country text not null default 'Ethiopia',
 guardian_region text not null,
 guardian_city text not null,
 guardian_woreda text not null,
 guardian_sub_city_or_zone text,
 guardian_kebele text,
 guardian_specific_address text,
 guardian_photo_url text,
 admission_date date default current_date,
 status text default 'Active'
);

create table if not exists subjects (
 id uuid primary key default gen_random_uuid(),
 grade int not null check(grade between 9 and 12),
 section text not null check(section in('Section A','Section B','Section C','Section D')),
 study_option text,
 subject_name text not null,
 subject_code text,
 maximum_mark numeric not null check(maximum_mark>0),
 created_at timestamptz default now()
);

create unique index if not exists subjects_unique on subjects(grade,section,(coalesce(study_option,'')),subject_name);

create table if not exists marks (
 id uuid primary key default gen_random_uuid(),
 student_id uuid not null references students(id) on delete cascade,
 subject_id uuid not null references subjects(id) on delete cascade,
 academic_year text not null,
 mark numeric null check(mark is null or mark >= 0),
 maximum_mark numeric not null check(maximum_mark > 0),
 updated_at timestamptz default now(),
 unique(student_id,subject_id,academic_year)
);

create table if not exists announcements (
 id uuid primary key default gen_random_uuid(),
 title text not null,
 title_om text,
 title_am text,
 body text not null,
 body_om text,
 body_am text,
 image_url text,
 published boolean default true,
 created_at timestamptz default now()
);

create table if not exists gallery (
 id uuid primary key default gen_random_uuid(),
 title text,
 image_url text not null,
 created_at timestamptz default now()
);

create table if not exists messages (
 id uuid primary key default gen_random_uuid(),
 name text,
 phone text,
 email text,
 message text not null,
 status text default 'New',
 created_at timestamptz default now()
);

create table if not exists school_settings (
 id int primary key default 1,
 school_name text default 'Bashasha Secondary School',
 phone text,
 email text default 'bashashascodaryschool@gmail.com',
 address text default 'Bashasha, Oromia, Ethiopia',
 hero_image_url text,
 pass_threshold numeric default 50,
 academic_year text default '2026',
 updated_at timestamptz default now()
);

insert into school_settings(id) values(1) on conflict do nothing;
