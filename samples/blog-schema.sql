
CREATE TABLE users (
  id serial primary key,
  username varchar(50) not null unique,
  email varchar(100) not null unique,
  password varchar(255) not null,
  created_at timestamp not null default current_timestamp,
  updated_at timestamp not null default current_timestamp,
  deleted_at timestamp 
);

create index idx_users_username on users(username)


CREATE TABLE posts (
  id serial primary key,
  title varchar(255) not null,
  content text not null,
  user_id integer not null references users(id),
  created_at timestamp not null default current_timestamp,
  updated_at timestamp not null default current_timestamp,
  deleted_at timestamp 
);

create index idx_posts_user_id on posts(user_id)

create index idx_posts_title on posts(title)


CREATE TABLE comments (
  id serial primary key,
  content text not null,
  post_id integer not null references posts(id),
  user_id integer not null references users(id),
  created_at timestamp not null default current_timestamp,
  updated_at timestamp not null default current_timestamp,
  deleted_at timestamp 
);

create index idx_comments_post_id on comments(post_id)

create index idx_comments_user_id on comments(user_id)


CREATE TABLE post_likes (
  id serial primary key,
  post_id integer not null references posts(id),
  user_id integer not null references users(id),
  created_at timestamp not null default current_timestamp
);

create unique index idx_post_likes_post_id_user_id on post_likes(post_id, user_id)


CREATE TABLE categories (
  id serial primary key,
  name varchar(50) not null unique,
  created_at timestamp not null default current_timestamp,
  updated_at timestamp not null default current_timestamp
);

create index idx_categories_name on categories(name)


CREATE TABLE post_categories (
  id serial primary key,
  post_id integer not null references posts(id),
  category_id integer not null references categories(id),
  created_at timestamp not null default current_timestamp
);

create unique index idx_post_categories_post_id_category_id on post_categories(post_id, category_id)


CREATE TABLE tags (
  id serial primary key,
  name varchar(50) not null unique,
  created_at timestamp not null default current_timestamp,
  updated_at timestamp not null default current_timestamp
);

create index idx_tags_name on tags(name)


CREATE TABLE post_tags (
  id serial primary key,
  post_id integer not null references posts(id),
  tag_id integer not null references tags(id),
  created_at timestamp not null default current_timestamp
);

create unique index idx_post_tags_post_id_tag_id on post_tags(post_id, tag_id)


CREATE TABLE followings (
  id serial primary key,
  user_id integer not null references users(id),
  followed_user_id integer not null references users(id),
  created_at timestamp not null default current_timestamp
);

create unique index idx_followings_user_id_followed_user_id on followings(user_id, followed_user_id)