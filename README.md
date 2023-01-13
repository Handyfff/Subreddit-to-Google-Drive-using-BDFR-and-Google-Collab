# Subreddit-to-Google-Drive-using-BDFR-and-Google-Collab
It can download an entire subreddit to your drive without any data usage.

This method works on common web browser including Mobile and iOS devices. 
I'm an actual noob at this so don't judge me. Also I don't know if there's any licensing or copyright issue with this method. This code runs BFDR in your Google Collab. It copies the subreddit posts to your Google Drive. I did a bulk download of a subreddit to a folder and it worked fine for both videos and images. You should be able to run all bfdr commands with this.
Here's the method.
Sign into your Google Account
Go to https://colab.research.google.com/
Click on New Notebook if shown or click the top left menu > File > New Notebook
A new tab will open with a an empty box. 
Paste this in the box

from google.colab import drive
drive.mount('/content/gdrive/', force_remount=True)

Click on execute (play sign)

It will ask to Connect to Drive. Click on it. Then choose your drive account you want to download the subreddit in. Sign in if you have to and click on Allow. You will be returned to the notebook page and it shoud say Mounted at Google Drive.

Now click on the + sign on top another box will open, Paste and Execute this

#install python 3.9
!sudo apt-get update -y
!sudo apt-get install python3.9
#change alternatives
!sudo update-alternatives --install /usr/bin/python3 python3 /usr/bin/python3.8 1
!sudo update-alternatives --install /usr/bin/python3 python3 /usr/bin/python3.9 2

Click + Sign again, paste and Execute this

# install pip for new python 
!sudo apt-get install python3.9-distutils
!wget https://bootstrap.pypa.io/get-pip.py
!python get-pip.py
# credit of these last two commands blongs to @Erik
# install colab's dependencies
!python -m pip install ipython ipython_genutils ipykernel jupyter_console prompt_toolkit h
# link to the old google package
!ln -s /usr/local/lib/python3.8/dist-packages/google \
       /usr/local/lib/python3.9/dist-packages/google

Now to check if Python 3.9 has installed properly Click on + Sign again and execute this

!python --version

It should return with Python 3.9.16 or higher.

Now to install BFDR, Click on + Sign, Paste and execute this

!python3 -m pip install bdfr --upgrade

After it's done, you can use bfdr commands. You have to simply click on + sign and run your command. Most simple one is let's say you want to download the entire subreddit r/videogamedunkey. You run this command

!python3 -m bdfr download ./gdrive/MyDrive/ --subreddit videogamedunkey

It will start downloading this subreddit to a folder called videogamedunkey to your drive. It will take a lot of time depending on number of posts and whether they're images or videos. So you can simply limit the new 100 posts by putting this at end of your commans 
-L 100

The entire command will look like this
!python3 -m bdfr download ./gdrive/MyDrive/ --subreddit videogamedunkey -L 100


Now once you're done using this I suggest you save this notebook for future use. You don't want to repeat this procedure again. For that click on top left menu click on file then Save a Copy in Drive. It will create this notebook into your drive within a folder called Collab Notebooks. Fir future you can just open this file into your browser and you won't have to paste anything this time. The procedure will be the same otherwise. Just remember to wait for the green tick to move to next execution(lol).
